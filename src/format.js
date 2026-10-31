/** @typedef {"metric" | "imperial"} Units */

const METERS_PER_MILE = 1609.344;
const FEET_PER_METER = 3.28084;

/** @param {number} value @param {number} [digits] */
function grouped(value, digits = 0) {
  return value.toLocaleString("en-US", { minimumFractionDigits: digits, maximumFractionDigits: digits });
}

/** @param {number} meters @param {Units} units @param {number} [digits] */
export function distance(meters, units, digits = 0) {
  return units === "imperial" ? `${grouped(meters / METERS_PER_MILE, digits)} mi` : `${grouped(meters / 1000, digits)} km`;
}

/** @param {number} meters @param {Units} units */
export function elevation(meters, units) {
  return units === "imperial" ? `${grouped(meters * FEET_PER_METER)} ft` : `${grouped(meters)} m`;
}

/** "123h 45m" for totals. @param {number} seconds */
export function hours(seconds) {
  const total = Math.round(seconds / 60);
  const h = Math.floor(total / 60);
  const m = total % 60;
  return h > 0 ? `${grouped(h)}h ${m}m` : `${m}m`;
}

/** "1:02:03" or "4:05" for race-like times. @param {number} seconds */
export function clock(seconds) {
  const rounded = Math.round(seconds);
  const h = Math.floor(rounded / 3600);
  const m = Math.floor((rounded % 3600) / 60);
  const s = String(rounded % 60).padStart(2, "0");
  return h > 0 ? `${h}:${String(m).padStart(2, "0")}:${s}` : `${m}:${s}`;
}

/** @param {number} seconds @param {number} meters @param {Units} units */
export function pace(seconds, meters, units) {
  const per = units === "imperial" ? METERS_PER_MILE : 1000;
  return `${clock((seconds / meters) * per)} /${units === "imperial" ? "mi" : "km"}`;
}

/** @param {number} seconds @param {number} meters @param {Units} units */
export function speed(seconds, meters, units) {
  const perHour = (meters / seconds) * 3.6;
  return units === "imperial" ? `${grouped(perHour / 1.609344, 1)} mph` : `${grouped(perHour, 1)} km/h`;
}

/** @param {number} meters */
export function effortLabel(meters) {
  const names = /** @type {Record<number, string>} */ ({ 1609.344: "1 mile", 21097.5: "Half marathon", 42195: "Marathon" });
  return names[meters] ?? `${grouped(meters / 1000)} km`;
}
