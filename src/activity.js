/**
 * @typedef {import("./sports.js").Sport} Sport
 * @typedef {{
 *   id: string,
 *   name: string,
 *   type: string,
 *   sport: Sport,
 *   start: number,
 *   distance: number,
 *   movingTime: number,
 *   elevationGain: number,
 *   file: string | null,
 * }} Activity
 *
 * `start` is epoch milliseconds (UTC), `distance` and `elevationGain` are meters, `movingTime` is seconds.
 */

/** @param {unknown} value */
export function number(value) {
  const parsed = typeof value === "number" ? value : Number(String(value ?? "").trim());
  return Number.isFinite(parsed) ? parsed : 0;
}
