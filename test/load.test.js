import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { bestEfforts, buildTrack, clean, haversine, simplify } from "../src/geo.js";
import { loadExport } from "../src/load.js";
import { csv, fit, gpx, gzip, makeZip, STRAVA_HEADER, straightTrack, stravaRow } from "./fixtures.js";

describe("geo", () => {
  test("haversine: one degree along a meridian is πR/180", () => {
    assert.ok(Math.abs(haversine(10, 20, 11, 20) - 111_195.08) < 0.01);
    assert.ok(Math.abs(haversine(60, 0, 60, 1) - 55_597.0) < 50);
  });

  test("drops GPS jumps and null-island fixes", () => {
    const start = Date.UTC(2025, 0, 1);
    const points = straightTrack({ start, seconds: 10, speed: 3 });
    points.splice(5, 0, { lat: points[4].lat + 0.05, lon: points[4].lon, time: start + 4500 });
    points.push({ lat: 0, lon: 0, time: start + 20000 });
    assert.equal(clean(points, "run").length, 11);
  });

  test("best effort at a steady 4:00/km pace is 20:00 for 5 km", () => {
    const points = straightTrack({ start: 0, seconds: 1800, speed: 1000 / 240, every: 3 });
    const efforts = bestEfforts(points, [1000, 5000, 10000]);
    assert.ok(Math.abs(efforts[1000] - 240) <= 1, String(efforts[1000]));
    assert.ok(Math.abs(efforts[5000] - 1200) <= 2, String(efforts[5000]));
    assert.equal(efforts[10000], undefined);
  });

  test("best effort finds the fast middle of a run", () => {
    const slow1 = straightTrack({ start: 0, seconds: 600, speed: 2.5, every: 2 });
    const fast = straightTrack({ start: 600_000, seconds: 300, speed: 5, every: 2, lat: slow1.at(-1)?.lat });
    const efforts = bestEfforts([...slow1, ...fast.slice(1)], [1000]);
    assert.ok(Math.abs(efforts[1000] - 200) <= 2, String(efforts[1000]));
  });

  test("simplify keeps the ends and thins dense points", () => {
    const points = straightTrack({ start: 0, seconds: 100, speed: 3 });
    const coords = simplify(points);
    assert.ok(coords.length / 2 < points.length / 3);
    assert.equal(coords.at(-2), Math.round((points.at(-1)?.lat ?? 0) * 1e5) / 1e5);
  });

  test("buildTrack ignores tracks without movement", () => {
    assert.equal(buildTrack([{ lat: 1, lon: 1, time: 0 }], "run"), null);
  });
});

describe("loadExport", () => {
  const start = Date.UTC(2025, 5, 1, 7);
  const run = straightTrack({ start, seconds: 1500, speed: 1000 / 300, every: 2 });

  test("reads a Strava export with FIT, GPX and gzip track files", async () => {
    const rows = [
      stravaRow({ "Activity ID": "1", "Activity Date": "Jun 1, 2025, 7:00:00 AM", "Activity Type": "Run", Distance: "5000", "Moving Time": "1500", Filename: "activities/1.fit.gz" }),
      stravaRow({ "Activity ID": "2", "Activity Date": "Jun 2, 2025, 7:00:00 AM", "Activity Type": "Ride", Distance: "20000", "Moving Time": "2400", Filename: "activities/2.gpx" }),
      stravaRow({ "Activity ID": "3", "Activity Date": "Jun 3, 2025, 7:00:00 AM", "Activity Type": "Weight Training", "Moving Time": "1800" }),
    ];
    const ride = straightTrack({ start: start + 86_400_000, seconds: 2400, speed: 8.33, every: 4, lon: -46.7 });
    const file = await makeZip({
      "export_123/activities.csv": csv(STRAVA_HEADER, rows),
      "export_123/activities/1.fit.gz": gzip(fit(run, 0)),
      "export_123/activities/2.gpx": gpx(ride, ""),
      "export_123/activities/broken.fit": "nope",
      "export_123/profile.csv": "x",
    });

    /** @type {number[]} */
    const seen = [];
    const data = await loadExport(file, (done) => seen.push(done));
    assert.equal(data.source, "strava");
    assert.deepEqual(data.activities.map((a) => a.sport), ["run", "ride", "other"]);
    assert.deepEqual(data.tracks.map((t) => t.sport).sort(), ["ride", "run"]);
    assert.equal(data.skipped, 1);
    const runTrack = data.tracks.find((t) => t.sport === "run");
    assert.ok(runTrack && Math.abs(runTrack.efforts[5000] - 1500) <= 3, JSON.stringify(runTrack?.efforts));
    assert.equal(seen.at(-1), 3);
  });

  test("reads a Garmin export with FIT files inside a nested ZIP", async () => {
    const summary = JSON.stringify([{
      summarizedActivitiesExport: [
        { activityId: 1, name: "Run", activityType: "running", beginTimestamp: start, distance: 500000, duration: 1500000 },
        { activityId: 1, name: "Run", activityType: "running", beginTimestamp: start, distance: 500000, duration: 1500000 },
      ],
    }]);
    const inner = await makeZip({ "123_ACTIVITY.fit": new Uint8Array(fit(run, 1)) });
    const file = await makeZip({
      "DI_CONNECT/DI-Connect-Fitness/me@example.com_0_summarizedActivities.json": summary,
      "DI_CONNECT/DI-Connect-Uploaded-Files/UploadedFiles_0-_Part1.zip": new Uint8Array(await inner.arrayBuffer()),
    });
    const data = await loadExport(file);
    assert.equal(data.source, "garmin");
    assert.equal(data.activities.length, 1);
    assert.equal(data.activities[0].distance, 5000);
    assert.equal(data.tracks.length, 1);
    assert.equal(data.tracks[0].sport, "run");
  });

  test("explains when the ZIP is not a known export", async () => {
    await assert.rejects(loadExport(await makeZip({ "photos/a.jpg": "x" })), /No activities found/);
  });
});
