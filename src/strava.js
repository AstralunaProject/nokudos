import { number } from "./activity.js";
import { parseCsv } from "./csv.js";
import { sportOf } from "./sports.js";

/** @typedef {import("./activity.js").Activity} Activity */

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

/**
 * "Activity Date" is written in UTC as "Jan 5, 2024, 7:12:33 AM".
 * @param {string} value
 */
export function parseStravaDate(value) {
  const match = /^([A-Za-z]{3})\w* (\d{1,2}), (\d{4}),? (\d{1,2}):(\d{2}):(\d{2})\s*([AP]M)?$/i.exec(value.trim());
  if (!match) {
    const fallback = Date.parse(/[zZ]|[+-]\d\d:?\d\d$/.test(value) ? value : `${value} UTC`);
    return Number.isNaN(fallback) ? null : fallback;
  }
  const [, month, day, year, hours, minutes, seconds, period] = match;
  const monthIndex = MONTHS.indexOf(month.toLowerCase());
  if (monthIndex < 0) return null;
  let hour = Number(hours) % 12;
  if (!period) hour = Number(hours);
  else if (period.toUpperCase() === "PM") hour += 12;
  return Date.UTC(Number(year), monthIndex, Number(day), hour, Number(minutes), Number(seconds));
}

/**
 * Strava repeats some headers: the first "Distance" is in km (meters for swims), the second
 * is always meters; the second "Elapsed Time" block also carries "Moving Time" in seconds.
 * @param {string} text contents of activities.csv
 * @returns {Activity[]}
 */
export function parseStravaActivities(text) {
  const [header, ...rows] = parseCsv(text);
  if (!header) return [];
  /** @param {string} name */
  const all = (name) => header.flatMap((column, index) => (column.trim() === name ? [index] : []));
  /** @param {string} name */
  const first = (name) => all(name)[0] ?? -1;
  /** @param {string} name */
  const last = (name) => all(name).at(-1) ?? -1;

  const required = ["Activity ID", "Activity Date", "Activity Type"];
  const missing = required.filter((name) => first(name) < 0);
  if (missing.length) {
    throw new Error(`activities.csv is missing ${missing.join(", ")}. Request the export with Strava set to English.`);
  }

  const distances = all("Distance");
  const id = first("Activity ID");
  const date = first("Activity Date");
  const name = first("Activity Name");
  const type = first("Activity Type");
  const moving = last("Moving Time");
  const elapsed = last("Elapsed Time");
  const elevation = first("Elevation Gain");
  const file = first("Filename");

  /** @type {Activity[]} */
  const activities = [];
  for (const row of rows) {
    if (row.length < header.length / 2) continue;
    const start = parseStravaDate(row[date] ?? "");
    if (start === null) continue;
    const label = row[type]?.trim() || "Workout";
    const sport = sportOf(label);
    let distance = number(row[distances.at(-1) ?? -1]);
    if (distances.length === 1 && sport !== "swim") distance *= 1000;
    activities.push({
      id: row[id] ?? "",
      name: row[name] ?? "",
      type: label,
      sport,
      start,
      distance,
      movingTime: number(row[moving]) || number(row[elapsed]),
      elevationGain: number(row[elevation]),
      file: row[file]?.trim() || null,
    });
  }
  return activities;
}
