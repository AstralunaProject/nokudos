import { buildTrack } from "./geo.js";
import { decodeFit } from "./fit.js";
import { parseGarminActivities } from "./garmin.js";
import { parseGpx, parseTcx } from "./gpx.js";
import { sportOf } from "./sports.js";
import { parseStravaActivities } from "./strava.js";
import { decompress, openZip } from "./zip.js";

/**
 * @typedef {import("./activity.js").Activity} Activity
 * @typedef {import("./geo.js").Track} Track
 * @typedef {import("./zip.js").ZipEntry} ZipEntry
 * @typedef {{ source: "strava" | "garmin", activities: Activity[], tracks: Track[], skipped: number }} ExportData
 * @typedef {(done: number, total: number) => void} Progress
 */

const TRACK_FILE = /\.(fit|gpx|tcx)(\.gz)?$/i;
const text = new TextDecoder();

/**
 * @param {string} name @param {Uint8Array<ArrayBuffer>} data
 * @returns {Promise<{ sport: string | null, points: import("./fit.js").Point[] } | null>}
 */
export async function readTrackFile(name, data) {
  const lower = name.toLowerCase();
  let content = data;
  if (lower.endsWith(".gz")) content = await decompress(data, "gzip");
  if (/\.fit(\.gz)?$/.test(lower)) return decodeFit(content);
  // Strava's own TCX exports start with spaces before the XML declaration.
  const xml = text.decode(content).trimStart();
  if (/\.gpx(\.gz)?$/.test(lower)) return parseGpx(xml);
  if (/\.tcx(\.gz)?$/.test(lower)) return parseTcx(xml);
  return null;
}

/**
 * @param {ZipEntry[]} entries @param {(entry: ZipEntry) => Promise<Uint8Array<ArrayBuffer>>} read
 * @param {Map<string, string>} sportByFile @param {Progress} progress
 */
async function readTracks(entries, read, sportByFile, progress) {
  /** @type {Track[]} */
  const tracks = [];
  let skipped = 0;
  for (const [index, entry] of entries.entries()) {
    progress(index, entries.length);
    try {
      const parsed = await readTrackFile(entry.name, await read(entry));
      const sport = sportOf(sportByFile.get(entry.name) ?? parsed?.sport);
      const track = parsed && buildTrack(parsed.points, sport);
      if (track) tracks.push(track);
    } catch {
      skipped++;
    }
  }
  progress(entries.length, entries.length);
  return { tracks, skipped };
}

/**
 * Reads a Strava or Garmin Connect data export without unpacking it to disk.
 * @param {Blob} file @param {Progress} [progress]
 * @returns {Promise<ExportData>}
 */
export async function loadExport(file, progress = () => {}) {
  const zip = await openZip(file);
  const csv = zip.entries.find((entry) => /(^|\/)activities\.csv$/.test(entry.name));

  if (csv) {
    const root = csv.name.slice(0, -"activities.csv".length);
    const activities = parseStravaActivities(text.decode(await zip.read(csv)));
    const sportByFile = new Map(activities.flatMap((a) => (a.file ? [[root + a.file, a.type]] : [])));
    const files = zip.entries.filter((entry) => entry.name.startsWith(`${root}activities/`) && TRACK_FILE.test(entry.name));
    const { tracks, skipped } = await readTracks(files, zip.read, sportByFile, progress);
    return { source: "strava", activities, tracks, skipped };
  }

  const summaries = zip.entries.filter((entry) => /summarizedActivities[^/]*\.json$/.test(entry.name));
  if (summaries.length === 0) {
    throw new Error("No activities found. Use the ZIP from Strava's \"Download your data\" or Garmin's data export.");
  }
  /** @type {Activity[]} */
  const activities = [];
  for (const entry of summaries) activities.push(...parseGarminActivities(text.decode(await zip.read(entry))));
  const unique = [...new Map(activities.map((a) => [a.id, a])).values()];

  /** @type {Track[]} */
  const tracks = [];
  let skipped = 0;
  const loose = zip.entries.filter((entry) => /\.fit$/i.test(entry.name));
  const archives = zip.entries.filter((entry) => /UploadedFiles[^/]*\.zip$/i.test(entry.name));
  const loaded = await readTracks(loose, zip.read, new Map(), progress);
  tracks.push(...loaded.tracks);
  skipped += loaded.skipped;
  for (const archive of archives) {
    const inner = await openZip(new Blob([await zip.read(archive)]));
    const files = inner.entries.filter((entry) => TRACK_FILE.test(entry.name));
    const result = await readTracks(files, inner.read, new Map(), progress);
    tracks.push(...result.tracks);
    skipped += result.skipped;
  }
  return { source: "garmin", activities: unique, tracks, skipped };
}
