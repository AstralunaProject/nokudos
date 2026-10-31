/**
 * GPX and TCX track points. Regular expressions instead of DOMParser so the same code runs in
 * a Web Worker and in Node; both formats keep coordinates and time in predictable tags.
 */

/** @typedef {import("./fit.js").Point} Point */

const GPX_POINT = /<trkpt\b([^>]*)>([\s\S]*?)<\/trkpt>/g;
const TCX_POINT = /<Trackpoint>([\s\S]*?)<\/Trackpoint>/g;

/** @param {string} source @param {string} name */
function attribute(source, name) {
  return new RegExp(`\\b${name}\\s*=\\s*["']([^"']+)["']`).exec(source)?.[1];
}

/** @param {string} source @param {string} name */
function tag(source, name) {
  return new RegExp(`<(?:\\w+:)?${name}>\\s*([^<]+?)\\s*</`).exec(source)?.[1];
}

/** @param {number} lat @param {number} lon @param {number} time */
function valid(lat, lon, time) {
  return Number.isFinite(lat) && Number.isFinite(lon) && Number.isFinite(time) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180;
}

/** @param {string} xml @returns {{ sport: string | null, points: Point[] }} */
export function parseGpx(xml) {
  /** @type {Point[]} */
  const points = [];
  for (const [, attributes, body] of xml.matchAll(GPX_POINT)) {
    const lat = Number(attribute(attributes, "lat"));
    const lon = Number(attribute(attributes, "lon"));
    const time = Date.parse(tag(body, "time") ?? "");
    if (valid(lat, lon, time)) points.push({ lat, lon, time });
  }
  return { sport: tag(xml, "type")?.toLowerCase() ?? null, points };
}

/** @param {string} xml @returns {{ sport: string | null, points: Point[] }} */
export function parseTcx(xml) {
  /** @type {Point[]} */
  const points = [];
  for (const [, body] of xml.matchAll(TCX_POINT)) {
    const lat = Number(tag(body, "LatitudeDegrees"));
    const lon = Number(tag(body, "LongitudeDegrees"));
    const time = Date.parse(tag(body, "Time") ?? "");
    if (valid(lat, lon, time)) points.push({ lat, lon, time });
  }
  const sport = attribute(/<Activity\b[^>]*>/.exec(xml)?.[0] ?? "", "Sport");
  return { sport: sport?.toLowerCase() ?? null, points };
}
