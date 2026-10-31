/**
 * ZIP reader over a Blob: reads the central directory, then each entry on demand, so a
 * multi-gigabyte export is never loaded whole. Handles ZIP64; inflates with DecompressionStream.
 */

/** @typedef {{ name: string, method: number, compressedSize: number, size: number, offset: number }} ZipEntry */

const EOCD = 0x06054b50;
const ZIP64_LOCATOR = 0x07064b50;
const ZIP64_EOCD = 0x06064b50;
const CENTRAL = 0x02014b50;
const LOCAL = 0x04034b50;

/** @param {Blob} blob @param {number} start @param {number} end */
async function bytes(blob, start, end) {
  return new Uint8Array(await blob.slice(start, end).arrayBuffer());
}

/** @param {DataView} view @param {number} at */
function u64(view, at) {
  return Number(view.getBigUint64(at, true));
}

/** @param {Uint8Array<ArrayBuffer>} data @param {CompressionFormat} format */
export async function decompress(data, format) {
  const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream(format));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** @param {Blob} blob */
async function findDirectory(blob) {
  const tailStart = Math.max(0, blob.size - 0xffff - 22);
  const tail = await bytes(blob, tailStart, blob.size);
  const view = new DataView(tail.buffer);
  let at = tail.length - 22;
  while (at >= 0 && view.getUint32(at, true) !== EOCD) at--;
  if (at < 0) throw new Error("This file is not a ZIP archive.");

  let count = view.getUint16(at + 10, true);
  let size = view.getUint32(at + 12, true);
  let offset = view.getUint32(at + 16, true);
  const locator = at - 20;
  if (locator >= 0 && view.getUint32(locator, true) === ZIP64_LOCATOR) {
    const recordAt = u64(view, locator + 8);
    const record = new DataView((await bytes(blob, recordAt, recordAt + 56)).buffer);
    if (record.getUint32(0, true) !== ZIP64_EOCD) throw new Error("Corrupted ZIP64 archive.");
    count = u64(record, 32);
    size = u64(record, 40);
    offset = u64(record, 48);
  }
  return { count, size, offset };
}

/**
 * @param {DataView} view @param {number} at @param {number} length
 * @param {{ size: number, compressedSize: number, offset: number }} entry
 */
function applyZip64(view, at, length, entry) {
  const end = at + length;
  while (at + 4 <= end) {
    const id = view.getUint16(at, true);
    const fieldSize = view.getUint16(at + 2, true);
    if (id === 0x0001) {
      let cursor = at + 4;
      for (const key of /** @type {const} */ (["size", "compressedSize", "offset"])) {
        if (entry[key] === 0xffffffff) {
          entry[key] = u64(view, cursor);
          cursor += 8;
        }
      }
      return;
    }
    at += 4 + fieldSize;
  }
}

/** @param {Blob} blob */
export async function openZip(blob) {
  const { count, size, offset } = await findDirectory(blob);
  const directory = await bytes(blob, offset, offset + size);
  const view = new DataView(directory.buffer);
  const decoder = new TextDecoder();
  /** @type {ZipEntry[]} */
  const entries = [];

  let at = 0;
  for (let i = 0; i < count; i++) {
    if (view.getUint32(at, true) !== CENTRAL) throw new Error("Corrupted ZIP directory.");
    const nameLength = view.getUint16(at + 28, true);
    const extraLength = view.getUint16(at + 30, true);
    const commentLength = view.getUint16(at + 32, true);
    const entry = {
      name: decoder.decode(directory.subarray(at + 46, at + 46 + nameLength)),
      method: view.getUint16(at + 10, true),
      compressedSize: view.getUint32(at + 20, true),
      size: view.getUint32(at + 24, true),
      offset: view.getUint32(at + 42, true),
    };
    applyZip64(view, at + 46 + nameLength, extraLength, entry);
    if (!entry.name.endsWith("/")) entries.push(entry);
    at += 46 + nameLength + extraLength + commentLength;
  }

  /** @param {ZipEntry} entry */
  async function read(entry) {
    const header = new DataView((await bytes(blob, entry.offset, entry.offset + 30)).buffer);
    if (header.getUint32(0, true) !== LOCAL) throw new Error(`Corrupted ZIP entry: ${entry.name}`);
    const start = entry.offset + 30 + header.getUint16(26, true) + header.getUint16(28, true);
    const data = await bytes(blob, start, start + entry.compressedSize);
    if (entry.method === 0) return data;
    if (entry.method === 8) return decompress(data, "deflate-raw");
    throw new Error(`Unsupported compression method ${entry.method} in ${entry.name}`);
  }

  return { entries, read };
}
