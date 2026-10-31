import { buildTrack, haversine } from "./geo.js";

/**
 * A made-up athlete's year, generated in the page so visitors without an export can try it.
 * Routes follow a street grid around a fixed point; the same seed always gives the same year.
 * @typedef {import("./load.js").ExportData} ExportData
 * @typedef {import("./fit.js").Point} Point
 * @typedef {import("./sports.js").Sport} Sport
 */

const HOME = { lat: -23.5614, lon: -46.6559 };
const METERS_PER_DEGREE = 111_195;

/** @param {number} seed */
function random(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6d2b79f5) >>> 0;
    let t = state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * @param {() => number} rand
 * @param {{ start: number, meters: number, speed: number, block: number }} options
 * @returns {Point[]}
 */
function gridRoute(rand, { start, meters, speed, block }) {
  const lonScale = METERS_PER_DEGREE * Math.cos((HOME.lat * Math.PI) / 180);
  let x = Math.round((rand() - 0.5) * 6) * block;
  let y = Math.round((rand() - 0.5) * 6) * block;
  let heading = Math.floor(rand() * 4);
  /** @type {Point[]} */
  const points = [];
  let covered = 0;
  let time = start;
  const step = speed * 5;
  let untilCorner = block;
  while (covered < meters) {
    points.push({ lat: HOME.lat + y / METERS_PER_DEGREE, lon: HOME.lon + x / lonScale, time });
    if (untilCorner <= 0) {
      const toward = Math.hypot(x, y) > meters / 3 ? (Math.abs(x) > Math.abs(y) ? (x > 0 ? 2 : 0) : y > 0 ? 3 : 1) : heading;
      const roll = rand();
      heading = roll < 0.45 ? heading : roll < 0.75 ? toward : (heading + (rand() < 0.5 ? 1 : 3)) % 4;
      untilCorner = block * (1 + Math.floor(rand() * 3));
    }
    const pace = step * (0.9 + rand() * 0.2);
    x += [pace, 0, -pace, 0][heading];
    y += [0, pace, 0, -pace][heading];
    untilCorner -= pace;
    covered += pace;
    time += 5000;
  }
  return points;
}

/** @param {Point[]} points */
function length(points) {
  let total = 0;
  for (let i = 1; i < points.length; i++) total += haversine(points[i - 1].lat, points[i - 1].lon, points[i].lat, points[i].lon);
  return total;
}

/** @param {number} year @returns {ExportData} */
export function demoExport(year) {
  const rand = random(year);
  /** @type {ExportData} */
  const data = { source: "strava", activities: [], tracks: [], skipped: 0 };

  /** @param {Date} day @param {Sport} sport @param {string} type @param {number} meters @param {number} speed @param {string} name */
  const add = (day, sport, type, meters, speed, name) => {
    const start = new Date(day);
    start.setHours(sport === "ride" ? 7 : 6, Math.floor(rand() * 50), 0, 0);
    const outdoor = sport !== "other";
    const points = outdoor ? gridRoute(rand, { start: start.getTime(), meters, speed, block: sport === "ride" ? 420 : 130 }) : [];
    const distance = outdoor ? length(points) : 0;
    const movingTime = outdoor ? (points.at(-1)?.time ?? start.getTime()) / 1000 - start.getTime() / 1000 : 2700;
    data.activities.push({
      id: `demo-${data.activities.length}`,
      name,
      type,
      sport,
      start: start.getTime(),
      distance,
      movingTime,
      elevationGain: outdoor ? Math.round(distance / 1000 * (sport === "ride" ? 9 : 6) * (0.6 + rand() * 0.8)) : 0,
      file: null,
    });
    const track = outdoor ? buildTrack(points, sport) : null;
    if (track) data.tracks.push(track);
  };

  for (const target of [year - 1, year]) {
    const fitness = target === year ? 1 : 0.8;
    for (let day = new Date(target, 0, 1); day.getFullYear() === target; day.setDate(day.getDate() + 1)) {
      const month = day.getMonth();
      const skip = rand() < (month === 11 || month === 0 ? 0.35 : 0.15);
      if (skip) continue;
      const build = 1 + month / 24;
      switch (day.getDay()) {
        case 2:
          add(day, "run", "Run", 7000 * build, 3.1 * fitness + rand() * 0.2, "Tuesday intervals");
          break;
        case 4:
          add(day, "run", "Run", 9000 * build, 3.0 * fitness + rand() * 0.15, "Easy run");
          break;
        case 6:
          add(day, "run", "Run", (14000 + rand() * 8000) * build, 2.9 * fitness, "Long run");
          break;
        case 0:
          if (rand() < 0.8) add(day, "ride", "Ride", 45000 + rand() * 35000, 7.8 * fitness + rand(), "Sunday ride");
          break;
        case 1:
          add(day, "other", "Weight Training", 0, 0, "Gym");
          break;
        case 5:
          if (rand() < 0.4) add(day, "walk", "Walk", 3000 + rand() * 3000, 1.4, "Evening walk");
          break;
      }
    }
  }
  const race = new Date(year, 9, 12);
  add(race, "run", "Run", 21300, 3.75, "Half marathon race day");
  return data;
}
