import { number } from "./activity.js";
import { sportOf } from "./sports.js";

/** @typedef {import("./activity.js").Activity} Activity */

/**
 * summarizedActivities.json from a Garmin Connect data export. Units differ from the Connect
 * API: distance and elevation in centimeters, durations in milliseconds.
 * @param {string} text
 * @returns {Activity[]}
 */
export function parseGarminActivities(text) {
  /** @type {unknown} */
  const data = JSON.parse(text);
  const blocks = Array.isArray(data) ? data : [data];
  /** @type {Activity[]} */
  const activities = [];
  for (const block of blocks) {
    const list = /** @type {{ summarizedActivitiesExport?: unknown }} */ (block)?.summarizedActivitiesExport;
    if (!Array.isArray(list)) continue;
    for (const item of list) {
      const start = number(item.beginTimestamp ?? item.startTimeGmt);
      if (!start) continue;
      const type = String(item.activityType ?? item.sportType ?? "other");
      activities.push({
        id: String(item.activityId ?? start),
        name: String(item.name ?? ""),
        type: type.replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase()),
        sport: sportOf(type),
        start,
        distance: number(item.distance) / 100,
        movingTime: (number(item.movingDuration) || number(item.duration)) / 1000,
        elevationGain: number(item.elevationGain) / 100,
        file: null,
      });
    }
  }
  return activities;
}
