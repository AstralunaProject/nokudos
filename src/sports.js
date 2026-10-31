/** @typedef {"run" | "ride" | "swim" | "walk" | "hike" | "other"} Sport */

/** @type {Sport[]} */
export const SPORTS = ["run", "ride", "swim", "walk", "hike", "other"];

export const SPORT_LABELS = /** @type {Record<Sport, string>} */ ({
  run: "Run",
  ride: "Ride",
  swim: "Swim",
  walk: "Walk",
  hike: "Hike",
  other: "Other",
});

/**
 * Maps Strava activity types ("Trail Run", "E-Bike Ride") and Garmin keys ("road_biking",
 * "lap_swimming") to a handful of categories.
 * @param {string | null | undefined} type
 * @returns {Sport}
 */
export function sportOf(type) {
  const key = (type ?? "").toLowerCase().replace(/[\s_-]+/g, "");
  if (/run/.test(key)) return "run";
  if (/ride|cycl|bik/.test(key)) return "ride";
  if (/swim/.test(key)) return "swim";
  if (/hik/.test(key)) return "hike";
  if (/walk/.test(key)) return "walk";
  return "other";
}
