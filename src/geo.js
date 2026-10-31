/**
 * @typedef {import("./fit.js").Point} Point
 * @typedef {import("./sports.js").Sport} Sport
 * @typedef {{ start: number, sport: Sport, coords: number[], efforts: Record<string, number> }} Track
 *
 * `coords` is a flat [lat, lon, lat, lon, ...] list simplified for drawing; `efforts` maps a
 * distance in meters to the fastest time in seconds over it.
 */

const EARTH_RADIUS = 6371008.8;
const RADIANS = Math.PI / 180;

export const EFFORTS = /** @type {Partial<Record<Sport, number[]>>} */ ({
  run: [1000, 1609.344, 5000, 10000, 21097.5, 42195],
  ride: [10000, 20000, 40000, 100000],
});

/** Faster than this between two fixes is a GPS jump, not movement (m/s). */
const MAX_SPEED = /** @type {Record<Sport, number>} */ ({
  run: 12.5,
  walk: 8,
  hike: 8,
  swim: 5,
  ride: 35,
  other: 60,
});

const DRAW_SPACING = 15;

/** @param {number} lat1 @param {number} lon1 @param {number} lat2 @param {number} lon2 */
export function haversine(lat1, lon1, lat2, lon2) {
  const dLat = (lat2 - lat1) * RADIANS;
  const dLon = (lon2 - lon1) * RADIANS;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * RADIANS) * Math.cos(lat2 * RADIANS) * Math.sin(dLon / 2) ** 2;
  return 2 * EARTH_RADIUS * Math.asin(Math.min(1, Math.sqrt(a)));
}

/**
 * Drops fixes that would need an impossible speed to reach, and (0, 0) placeholders.
 * @param {Point[]} points @param {Sport} sport
 */
export function clean(points, sport) {
  /** @type {Point[]} */
  const kept = [];
  for (const point of points) {
    if (point.lat === 0 && point.lon === 0) continue;
    const previous = kept.at(-1);
    if (previous) {
      const seconds = (point.time - previous.time) / 1000;
      if (seconds < 0) continue;
      const meters = haversine(previous.lat, previous.lon, point.lat, point.lon);
      if (meters > MAX_SPEED[sport] * Math.max(seconds, 1)) continue;
    }
    kept.push(point);
  }
  return kept;
}

/**
 * Fastest time over each distance, using a sliding window on cumulative distance and scaling
 * the window to the exact target so sparse fixes do not inflate the result.
 * @param {Point[]} points @param {number[]} targets
 */
export function bestEfforts(points, targets) {
  /** @type {Record<string, number>} */
  const efforts = {};
  if (points.length < 2) return efforts;
  const cumulative = [0];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1];
    const b = points[i];
    cumulative.push(cumulative[i - 1] + haversine(a.lat, a.lon, b.lat, b.lon));
  }
  for (const target of targets) {
    let best = Infinity;
    let i = 0;
    for (let j = 1; j < points.length; j++) {
      while (i + 1 < j && cumulative[j] - cumulative[i + 1] >= target) i++;
      const covered = cumulative[j] - cumulative[i];
      if (covered < target) continue;
      const seconds = ((points[j].time - points[i].time) / 1000) * (target / covered);
      if (seconds > 0 && seconds < best) best = seconds;
    }
    if (Number.isFinite(best)) efforts[target] = Math.round(best);
  }
  return efforts;
}

/** @param {Point[]} points */
export function simplify(points) {
  /** @type {number[]} */
  const coords = [];
  let last = /** @type {Point | null} */ (null);
  for (const point of points) {
    if (last && haversine(last.lat, last.lon, point.lat, point.lon) < DRAW_SPACING) continue;
    coords.push(Math.round(point.lat * 1e5) / 1e5, Math.round(point.lon * 1e5) / 1e5);
    last = point;
  }
  const end = points.at(-1);
  if (end && end !== last) coords.push(Math.round(end.lat * 1e5) / 1e5, Math.round(end.lon * 1e5) / 1e5);
  return coords;
}

/**
 * @param {Point[]} raw @param {Sport} sport
 * @returns {Track | null}
 */
export function buildTrack(raw, sport) {
  const points = clean(raw, sport);
  if (points.length < 2) return null;
  return {
    start: points[0].time,
    sport,
    coords: simplify(points),
    efforts: bestEfforts(points, EFFORTS[sport] ?? []),
  };
}
