import { SPORTS } from "./sports.js";

/**
 * @typedef {import("./activity.js").Activity} Activity
 * @typedef {import("./geo.js").Track} Track
 * @typedef {import("./sports.js").Sport} Sport
 * @typedef {{ sport: Sport, count: number, distance: number, movingTime: number, elevationGain: number }} SportTotal
 * @typedef {{ distance: number, seconds: number, start: number }} Effort
 * @typedef {{
 *   year: number,
 *   count: number,
 *   distance: number,
 *   movingTime: number,
 *   elevationGain: number,
 *   activeDays: number,
 *   longestStreak: number,
 *   bySport: SportTotal[],
 *   months: number[],
 *   days: Map<string, number>,
 *   longest: Activity | null,
 *   biggestClimb: Activity | null,
 *   favoriteWeekday: number | null,
 *   efforts: Partial<Record<Sport, Effort[]>>,
 *   previousDistance: number,
 * }} Review
 */

const DAY_MS = 86_400_000;

/** Local calendar date, so an evening run counts on the day the athlete lived it. @param {number} time */
export function dayKey(time) {
  const date = new Date(time);
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

/** @param {number} time */
const yearOf = (time) => new Date(time).getFullYear();

/** @param {Activity[]} activities */
export function yearsOf(activities) {
  return [...new Set(activities.map((a) => yearOf(a.start)))].sort((a, b) => b - a);
}

/** @param {string[]} keys sorted YYYY-MM-DD */
export function longestStreak(keys) {
  let best = 0;
  let current = 0;
  let previous = -Infinity;
  for (const key of keys) {
    const [y, m, d] = key.split("-").map(Number);
    const day = Date.UTC(y, m - 1, d) / DAY_MS;
    current = day === previous + 1 ? current + 1 : 1;
    best = Math.max(best, current);
    previous = day;
  }
  return best;
}

/**
 * The same activity can come in twice (Garmin keeps re-uploaded originals), so tracks starting
 * in the same minute with the same sport count once.
 * @param {Track[]} tracks
 */
export function uniqueTracks(tracks) {
  /** @type {Map<string, Track>} */
  const unique = new Map();
  for (const track of tracks) {
    const key = `${track.sport}:${Math.round(track.start / 60_000)}`;
    if (!unique.has(key)) unique.set(key, track);
  }
  return [...unique.values()];
}

/**
 * @param {Track[]} tracks @param {Sport} sport
 * @returns {Effort[]}
 */
function fastest(tracks, sport) {
  /** @type {Map<number, Effort>} */
  const best = new Map();
  for (const track of tracks) {
    if (track.sport !== sport) continue;
    for (const [distance, seconds] of Object.entries(track.efforts)) {
      const meters = Number(distance);
      const current = best.get(meters);
      if (!current || seconds < current.seconds) best.set(meters, { distance: meters, seconds, start: track.start });
    }
  }
  return [...best.values()].sort((a, b) => a.distance - b.distance);
}

/**
 * @param {Activity[]} all @param {Track[]} allTracks
 * @param {{ year: number, sport?: Sport | "all" }} filter
 * @returns {Review}
 */
export function review(all, allTracks, { year, sport = "all" }) {
  /** @param {{ sport: Sport }} item */
  const matchesSport = (item) => sport === "all" || item.sport === sport;
  const activities = all.filter((a) => yearOf(a.start) === year && matchesSport(a)).sort((a, b) => a.start - b.start);
  const tracks = uniqueTracks(allTracks.filter((t) => yearOf(t.start) === year && matchesSport(t)));

  /** @type {Map<string, number>} */
  const days = new Map();
  const months = Array.from({ length: 12 }, () => 0);
  const weekdays = Array.from({ length: 7 }, () => 0);
  /** @type {Map<Sport, SportTotal>} */
  const bySport = new Map();
  let distance = 0;
  let movingTime = 0;
  let elevationGain = 0;
  /** @type {Activity | null} */
  let longest = null;
  /** @type {Activity | null} */
  let biggestClimb = null;

  for (const activity of activities) {
    distance += activity.distance;
    movingTime += activity.movingTime;
    elevationGain += activity.elevationGain;
    const key = dayKey(activity.start);
    days.set(key, (days.get(key) ?? 0) + activity.movingTime);
    const date = new Date(activity.start);
    months[date.getMonth()] += activity.distance;
    weekdays[date.getDay()]++;

    const total = bySport.get(activity.sport) ?? { sport: activity.sport, count: 0, distance: 0, movingTime: 0, elevationGain: 0 };
    total.count++;
    total.distance += activity.distance;
    total.movingTime += activity.movingTime;
    total.elevationGain += activity.elevationGain;
    bySport.set(activity.sport, total);

    if (activity.distance > (longest?.distance ?? 0)) longest = activity;
    if (activity.elevationGain > (biggestClimb?.elevationGain ?? 0)) biggestClimb = activity;
  }

  const busiest = Math.max(...weekdays);
  /** @type {Partial<Record<Sport, Effort[]>>} */
  const efforts = {};
  for (const name of /** @type {Sport[]} */ (["run", "ride"])) {
    const list = fastest(tracks, name);
    if (list.length) efforts[name] = list;
  }

  return {
    year,
    count: activities.length,
    distance,
    movingTime,
    elevationGain,
    activeDays: days.size,
    longestStreak: longestStreak([...days.keys()].sort()),
    bySport: SPORTS.flatMap((name) => bySport.get(name) ?? []).sort((a, b) => b.movingTime - a.movingTime),
    months,
    days,
    longest,
    biggestClimb,
    favoriteWeekday: busiest > 0 ? weekdays.indexOf(busiest) : null,
    efforts,
    previousDistance: all.filter((a) => yearOf(a.start) === year - 1 && matchesSport(a)).reduce((sum, a) => sum + a.distance, 0),
  };
}
