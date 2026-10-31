/**
 * Minimal FIT decoder: extracts the sport and the GPS points of an activity.
 * Protocol reference: Garmin FIT SDK, "Flexible and Interoperable Data Transfer Protocol".
 */

/** @typedef {{ lat: number, lon: number, time: number }} Point */

const FIT_EPOCH_MS = 631065600000;
const SEMICIRCLE_TO_DEGREES = 180 / 2 ** 31;
const MESG_RECORD = 20;
const MESG_SESSION = 18;
const MESG_SPORT = 12;
const FIELD_TIMESTAMP = 253;

/** Garmin sport enum values worth naming; anything else is "other". */
const SPORTS = /** @type {Record<number, string>} */ ({
  1: "running",
  2: "cycling",
  5: "swimming",
  11: "walking",
  17: "hiking",
});

/** @typedef {{ number: number, size: number, type: number }} FieldDef */
/** @typedef {{ global: number, little: boolean, fields: FieldDef[], devSize: number }} Definition */

/** @param {DataView} view @param {number} at @param {number} size @param {number} type @param {boolean} little */
function readValue(view, at, size, type, little) {
  switch (type & 0x1f) {
    case 0x00:
    case 0x02:
    case 0x0a:
    case 0x0d:
      if (size !== 1) return null;
      return view.getUint8(at);
    case 0x01:
      return size === 1 ? view.getInt8(at) : null;
    case 0x03:
      return size === 2 ? view.getInt16(at, little) : null;
    case 0x04:
    case 0x0b:
      return size === 2 ? view.getUint16(at, little) : null;
    case 0x05:
      return size === 4 ? view.getInt32(at, little) : null;
    case 0x06:
    case 0x0c:
      return size === 4 ? view.getUint32(at, little) : null;
    default:
      return null;
  }
}

/** @param {number | null} value @param {number} type */
function isValid(value, type) {
  if (value === null) return false;
  switch (type & 0x1f) {
    case 0x00:
    case 0x02:
    case 0x0d:
      return value !== 0xff;
    case 0x01:
      return value !== 0x7f;
    case 0x03:
      return value !== 0x7fff;
    case 0x04:
      return value !== 0xffff;
    case 0x05:
      return value !== 0x7fffffff;
    case 0x06:
      return value !== 0xffffffff;
    case 0x0a:
    case 0x0b:
    case 0x0c:
      return value !== 0;
    default:
      return true;
  }
}

/**
 * @param {Uint8Array} data
 * @returns {{ sport: string | null, points: Point[] }}
 */
export function decodeFit(data) {
  const view = new DataView(data.buffer, data.byteOffset, data.byteLength);
  /** @type {Point[]} */
  const points = [];
  /** @type {string | null} */
  let sport = null;
  let fileStart = 0;
  if (data.length < 12) throw new Error("Not a FIT file.");

  while (fileStart + 12 <= data.length) {
    const headerSize = view.getUint8(fileStart);
    const dataSize = view.getUint32(fileStart + 4, true);
    const signature = String.fromCharCode(...data.subarray(fileStart + 8, fileStart + 12));
    if (signature !== ".FIT" || headerSize < 12) {
      if (fileStart === 0) throw new Error("Not a FIT file.");
      break;
    }
    const end = Math.min(data.length, fileStart + headerSize + dataSize);
    /** @type {Map<number, Definition>} */
    const definitions = new Map();
    let lastTimestamp = 0;
    let at = fileStart + headerSize;

    while (at < end) {
      const header = view.getUint8(at++);
      let local;
      let compressedTime = -1;

      if (header & 0x80) {
        local = (header >> 5) & 0x03;
        compressedTime = header & 0x1f;
      } else if (header & 0x40) {
        local = header & 0x0f;
        const little = view.getUint8(at + 1) === 0;
        const global = little ? view.getUint16(at + 2, true) : view.getUint16(at + 2, false);
        const count = view.getUint8(at + 4);
        at += 5;
        /** @type {FieldDef[]} */
        const fields = [];
        for (let i = 0; i < count; i++, at += 3) {
          fields.push({ number: view.getUint8(at), size: view.getUint8(at + 1), type: view.getUint8(at + 2) });
        }
        let devSize = 0;
        if (header & 0x20) {
          const devCount = view.getUint8(at++);
          for (let i = 0; i < devCount; i++, at += 3) devSize += view.getUint8(at + 1);
        }
        definitions.set(local, { global, little, fields, devSize });
        continue;
      } else {
        local = header & 0x0f;
      }

      const definition = definitions.get(local);
      if (!definition) throw new Error("Corrupted FIT file: data before its definition.");

      /** @type {Map<number, number>} */
      const values = new Map();
      for (const field of definition.fields) {
        const value = readValue(view, at, field.size, field.type, definition.little);
        if (isValid(value, field.type)) values.set(field.number, /** @type {number} */ (value));
        at += field.size;
      }
      at += definition.devSize;

      const stamp = values.get(FIELD_TIMESTAMP);
      if (stamp !== undefined) {
        lastTimestamp = stamp;
      } else if (compressedTime >= 0) {
        lastTimestamp += (compressedTime - (lastTimestamp & 0x1f)) & 0x1f;
      }

      if (definition.global === MESG_RECORD) {
        const lat = values.get(0);
        const lon = values.get(1);
        if (lat !== undefined && lon !== undefined && lastTimestamp) {
          points.push({
            lat: lat * SEMICIRCLE_TO_DEGREES,
            lon: lon * SEMICIRCLE_TO_DEGREES,
            time: FIT_EPOCH_MS + lastTimestamp * 1000,
          });
        }
      } else if ((definition.global === MESG_SESSION && values.has(5)) || (definition.global === MESG_SPORT && values.has(0))) {
        const code = /** @type {number} */ (values.get(definition.global === MESG_SESSION ? 5 : 0));
        sport ??= SPORTS[code] ?? "other";
      }
    }
    fileStart = end + 2;
  }
  return { sport, points };
}
