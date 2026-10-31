import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { clock, distance, effortLabel, elevation, hours, pace, speed } from "../src/format.js";
import { dayKey, longestStreak, review, uniqueTracks, yearsOf } from "../src/stats.js";

/**
 * @param {string} iso @param {Partial<import("../src/activity.js").Activity>} [extra]
 * @returns {import("../src/activity.js").Activity}
 */
function activity(iso, extra = {}) {
  return { id: iso, name: "", type: "Run", sport: "run", start: Date.parse(iso), distance: 5000, movingTime: 1800, elevationGain: 20, file: null, ...extra };
}

describe("stats", () => {
  test("streaks count consecutive local days", () => {
    assert.equal(longestStreak(["2025-01-30", "2025-01-31", "2025-02-01", "2025-02-03"]), 3);
    assert.equal(longestStreak(["2024-12-31", "2025-01-01"]), 2);
    assert.equal(longestStreak([]), 0);
  });

  test("days and years use local time", () => {
    assert.equal(process.env.TZ, "UTC", "run tests through npm test");
    assert.equal(dayKey(Date.UTC(2025, 0, 2, 23, 59)), "2025-01-02");
    assert.deepEqual(yearsOf([activity("2024-05-01T10:00:00Z"), activity("2025-01-01T10:00:00Z")]), [2025, 2024]);
  });

  test("year review totals, months, sports and records", () => {
    const all = [
      activity("2024-06-01T10:00:00Z", { distance: 3000 }),
      activity("2025-01-04T07:00:00Z"),
      activity("2025-01-04T18:00:00Z", { sport: "ride", type: "Ride", distance: 40000, movingTime: 5400, elevationGain: 600 }),
      activity("2025-01-05T07:00:00Z", { distance: 21100, movingTime: 7000, elevationGain: 150 }),
      activity("2025-03-10T07:00:00Z", { sport: "other", type: "Weight Training", distance: 0, movingTime: 3600, elevationGain: 0 }),
    ];
    /** @type {import("../src/geo.js").Track[]} */
    const tracks = [
      { start: Date.parse("2025-01-04T07:00:00Z"), sport: /** @type {const} */ ("run"), coords: [], efforts: { 1000: 280, 5000: 1500 } },
      { start: Date.parse("2025-01-04T07:00:20Z"), sport: /** @type {const} */ ("run"), coords: [], efforts: { 1000: 100 } },
      { start: Date.parse("2025-01-05T07:00:00Z"), sport: /** @type {const} */ ("run"), coords: [], efforts: { 1000: 270, 5000: 1550 } },
    ];
    const r = review(all, tracks, { year: 2025 });
    assert.equal(r.count, 4);
    assert.equal(r.distance, 66100);
    assert.equal(r.activeDays, 3);
    assert.equal(r.longestStreak, 2);
    assert.equal(r.months[0], 66100);
    assert.equal(r.longest?.sport, "ride");
    assert.equal(r.biggestClimb?.elevationGain, 600);
    assert.equal(r.favoriteWeekday, 6);
    assert.deepEqual(r.bySport.map((s) => s.sport), ["run", "ride", "other"]);
    assert.equal(r.previousDistance, 3000);
    assert.deepEqual(r.efforts.run?.map((e) => [e.distance, e.seconds]), [[1000, 270], [5000, 1500]]);

    const runs = review(all, tracks, { year: 2025, sport: "run" });
    assert.equal(runs.count, 2);
    assert.equal(runs.longest?.distance, 21100);
  });

  test("duplicate uploads count once", () => {
    const track = { start: 60_000, sport: /** @type {const} */ ("run"), coords: [], efforts: {} };
    assert.equal(uniqueTracks([track, { ...track, start: 61_000 }, { ...track, sport: "ride" }]).length, 2);
  });
});

describe("format", () => {
  test("metric and imperial", () => {
    assert.equal(distance(1234567, "metric"), "1,235 km");
    assert.equal(distance(1609.344 * 10, "imperial", 1), "10.0 mi");
    assert.equal(elevation(1000, "imperial"), "3,281 ft");
    assert.equal(hours(7 * 3600 + 5 * 60 + 29), "7h 5m");
    assert.equal(hours(45 * 60), "45m");
    assert.equal(clock(3723), "1:02:03");
    assert.equal(clock(245), "4:05");
    assert.equal(pace(1500, 5000, "metric"), "5:00 /km");
    assert.equal(speed(3600, 30000, "metric"), "30.0 km/h");
    assert.equal(effortLabel(21097.5), "Half marathon");
    assert.equal(effortLabel(10000), "10 km");
  });
});

describe("heatmap", async () => {
  const { focusBounds, project } = await import("../src/heatmap.js");

  test("projects to normalized Web Mercator", () => {
    assert.deepEqual(project(0, 0), { x: 0.5, y: 0.5 });
    assert.ok(project(60, 10).y < 0.5);
  });

  test("focuses on where most activities start and ignores a trip away", () => {
    /** @param {number} lat @param {number} lon @returns {import("../src/geo.js").Track} */
    const loop = (lat, lon) => ({ start: 0, sport: "run", efforts: {}, coords: [lat, lon, lat + 0.01, lon, lat + 0.01, lon + 0.01, lat, lon] });
    const home = [loop(-23.56, -46.66), loop(-23.57, -46.65), loop(-23.55, -46.67)];
    const bounds = focusBounds([...home, loop(48.85, 2.35)]);
    assert.ok(bounds);
    const paris = project(48.85, 2.35);
    assert.ok(paris.x > bounds.maxX);
    const sp = project(-23.56, -46.66);
    assert.ok(sp.x > bounds.minX && sp.x < bounds.maxX && sp.y > bounds.minY && sp.y < bounds.maxY);
    assert.equal(focusBounds([]), null);
  });
});
