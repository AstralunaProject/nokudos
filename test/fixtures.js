import { gzipSync } from "node:zlib";

/**
 * Builds a ZIP (stored or deflated) in memory, like the exports Strava and Garmin send.
 * @param {Record<string, string | Uint8Array<ArrayBuffer>>} files
 * @param {{ deflate?: boolean }} [options]
 */
export async function makeZip(files, { deflate = true } = {}) {
  const { deflateRawSync } = await import("node:zlib");
  const encoder = new TextEncoder();
  /** @type {Uint8Array<ArrayBuffer>[]} */
  const parts = [];
  /** @type {Uint8Array<ArrayBuffer>[]} */
  const central = [];
  let offset = 0;
  for (const [name, content] of Object.entries(files)) {
    const raw = typeof content === "string" ? encoder.encode(content) : content;
    const data = deflate ? new Uint8Array(deflateRawSync(raw)) : raw;
    const nameBytes = encoder.encode(name);
    const local = new DataView(new ArrayBuffer(30));
    local.setUint32(0, 0x04034b50, true);
    local.setUint16(8, deflate ? 8 : 0, true);
    local.setUint32(18, data.length, true);
    local.setUint32(22, raw.length, true);
    local.setUint16(26, nameBytes.length, true);
    parts.push(new Uint8Array(local.buffer), nameBytes, data);

    const entry = new DataView(new ArrayBuffer(46));
    entry.setUint32(0, 0x02014b50, true);
    entry.setUint16(10, deflate ? 8 : 0, true);
    entry.setUint32(20, data.length, true);
    entry.setUint32(24, raw.length, true);
    entry.setUint16(28, nameBytes.length, true);
    entry.setUint32(42, offset, true);
    central.push(new Uint8Array(entry.buffer), nameBytes);
    offset += 30 + nameBytes.length + data.length;
  }
  const centralSize = central.reduce((sum, part) => sum + part.length, 0);
  const end = new DataView(new ArrayBuffer(22));
  end.setUint32(0, 0x06054b50, true);
  end.setUint16(8, Object.keys(files).length, true);
  end.setUint16(10, Object.keys(files).length, true);
  end.setUint32(12, centralSize, true);
  end.setUint32(16, offset, true);
  return new Blob([...parts, ...central, new Uint8Array(end.buffer)]);
}

/** @param {string | Uint8Array} content */
export function gzip(content) {
  return new Uint8Array(gzipSync(content));
}

/**
 * Generates a straight track heading north at a constant speed, starting at `start`.
 * @param {{ start: number, seconds: number, speed: number, every?: number, lat?: number, lon?: number }} options
 */
export function straightTrack({ start, seconds, speed, every = 1, lat = -23.55, lon = -46.63 }) {
  const metersPerDegree = 111195.08;
  /** @type {{ lat: number, lon: number, time: number }[]} */
  const points = [];
  for (let t = 0; t <= seconds; t += every) {
    points.push({ lat: lat + (speed * t) / metersPerDegree, lon, time: start + t * 1000 });
  }
  return points;
}

/** @param {{ lat: number, lon: number, time: number }[]} points @param {string} [type] */
export function gpx(points, type = "running") {
  const body = points
    .map((p) => `<trkpt lat="${p.lat}" lon="${p.lon}"><ele>10</ele><time>${new Date(p.time).toISOString()}</time></trkpt>`)
    .join("\n");
  return `<?xml version="1.0"?><gpx creator="StravaGPX"><trk><type>${type}</type><trkseg>${body}</trkseg></trk></gpx>`;
}

const FIT_EPOCH = 631065600;

/**
 * Minimal FIT encoder: a sport message plus one record per point, with every other record
 * using a compressed timestamp header to exercise that path in the decoder.
 * @param {{ lat: number, lon: number, time: number }[]} points @param {number} sport
 */
export function fit(points, sport) {
  /** @type {number[]} */
  const body = [];
  const u8 = (/** @type {number} */ v) => body.push(v & 0xff);
  const u16 = (/** @type {number} */ v) => body.push(v & 0xff, (v >> 8) & 0xff);
  const u32 = (/** @type {number} */ v) => body.push(v & 0xff, (v >>> 8) & 0xff, (v >>> 16) & 0xff, (v >>> 24) & 0xff);
  const semicircles = (/** @type {number} */ deg) => Math.round((deg * 2 ** 31) / 180);

  u8(0x40 | 0); u8(0); u8(0); u16(12); u8(1); u8(0); u8(1); u8(0x00);
  u8(0); u8(sport);
  u8(0x40 | 1); u8(0); u8(0); u16(20); u8(3); u8(253); u8(4); u8(0x86); u8(0); u8(4); u8(0x85); u8(1); u8(4); u8(0x85);
  u8(0x40 | 2); u8(0); u8(0); u16(20); u8(2); u8(0); u8(4); u8(0x85); u8(1); u8(4); u8(0x85);

  points.forEach((point, index) => {
    const stamp = Math.round(point.time / 1000) - FIT_EPOCH;
    if (index % 2 === 1) {
      u8(0x80 | (2 << 5) | (stamp & 0x1f));
    } else {
      u8(1);
      u32(stamp);
    }
    u32(semicircles(point.lat));
    u32(semicircles(point.lon));
  });

  const header = [14, 0x20, 0x08, 0x08, 0, 0, 0, 0, 0x2e, 0x46, 0x49, 0x54, 0, 0];
  const size = body.length;
  header[4] = size & 0xff;
  header[5] = (size >> 8) & 0xff;
  header[6] = (size >> 16) & 0xff;
  header[7] = (size >>> 24) & 0xff;
  return new Uint8Array([...header, ...body, 0, 0]);
}

/** @param {string[]} header @param {string[][]} rows */
export function csv(header, rows) {
  const quote = (/** @type {string} */ v) => (/[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v);
  return [header.join(","), ...rows.map((row) => header.map((_, i) => quote(row[i] ?? "")).join(","))].join("\n");
}

/** Header order of a real activities.csv, including its repeated columns. */
export const STRAVA_HEADER = [
  "Activity ID", "Activity Date", "Activity Name", "Activity Type", "Activity Description",
  "Elapsed Time", "Distance", "Max Heart Rate", "Relative Effort", "Commute",
  "Activity Private Note", "Activity Gear", "Filename", "Athlete Weight", "Bike Weight",
  "Elapsed Time", "Moving Time", "Distance", "Max Speed", "Average Speed", "Elevation Gain",
];

/** @param {Partial<Record<string, string>>} values */
export function stravaRow(values) {
  /** @type {Record<string, number>} */
  const positions = { "Elapsed Time": 15, Distance: 17 };
  const row = STRAVA_HEADER.map(() => "");
  for (const [key, value] of Object.entries(values)) {
    const index = positions[key] ?? STRAVA_HEADER.indexOf(key);
    row[index] = value ?? "";
  }
  return row;
}
