import assert from "node:assert/strict";
import { describe, test } from "node:test";
import { parseCsv } from "../src/csv.js";
import { decodeFit } from "../src/fit.js";
import { parseGarminActivities } from "../src/garmin.js";
import { parseGpx, parseTcx } from "../src/gpx.js";
import { sportOf } from "../src/sports.js";
import { parseStravaActivities, parseStravaDate } from "../src/strava.js";
import { openZip } from "../src/zip.js";
import { csv, fit, gpx, makeZip, STRAVA_HEADER, straightTrack, stravaRow } from "./fixtures.js";

describe("csv", () => {
  test("handles quotes, commas, doubled quotes, CRLF and line breaks inside fields", () => {
    const text = '﻿a,b\r\n"x, y","say ""hi""\nagain"\r\nlast,';
    assert.deepEqual(parseCsv(text), [["a", "b"], ["x, y", 'say "hi"\nagain'], ["last", ""]]);
  });
});

describe("zip", () => {
  test("lists and reads stored and deflated entries", async () => {
    for (const deflate of [true, false]) {
      const zip = await openZip(await makeZip({ "export/a.txt": "hello", "export/b/c.txt": "world".repeat(100) }, { deflate }));
      assert.deepEqual(zip.entries.map((e) => e.name), ["export/a.txt", "export/b/c.txt"]);
      assert.equal(new TextDecoder().decode(await zip.read(zip.entries[1])), "world".repeat(100));
    }
  });

  test("rejects files that are not ZIP archives", async () => {
    await assert.rejects(openZip(new Blob(["just text"])), /not a ZIP/);
  });
});

describe("strava", () => {
  test("parses dates written in UTC with 12-hour clock", () => {
    assert.equal(parseStravaDate("Jan 5, 2024, 7:12:33 AM"), Date.UTC(2024, 0, 5, 7, 12, 33));
    assert.equal(parseStravaDate("Dec 31, 2025, 12:05:00 AM"), Date.UTC(2025, 11, 31, 0, 5, 0));
    assert.equal(parseStravaDate("Jul 4, 2025, 12:30:00 PM"), Date.UTC(2025, 6, 4, 12, 30, 0));
    assert.equal(parseStravaDate("2025-03-01 10:00:00"), Date.UTC(2025, 2, 1, 10));
    assert.equal(parseStravaDate("ontem"), null);
  });

  test("uses the meters/seconds column when headers repeat", () => {
    const text = csv(STRAVA_HEADER, [
      stravaRow({
        "Activity ID": "1", "Activity Date": "Mar 2, 2025, 9:00:00 AM", "Activity Name": "Morning, easy",
        "Activity Type": "Run", "Distance": "10021.5", "Moving Time": "3000", "Elapsed Time": "3100",
        "Elevation Gain": "42.5", "Filename": "activities/1.fit.gz",
      }),
    ]);
    const [run] = parseStravaActivities(text);
    assert.equal(run.distance, 10021.5);
    assert.equal(run.movingTime, 3000);
    assert.equal(run.elevationGain, 42.5);
    assert.equal(run.sport, "run");
    assert.equal(run.name, "Morning, easy");
    assert.equal(run.file, "activities/1.fit.gz");
  });

  test("explains a non-English export", () => {
    assert.throws(() => parseStravaActivities("ID da atividade,Data\n1,2"), /English/);
  });
});

describe("garmin", () => {
  test("converts centimeters and milliseconds", () => {
    const json = JSON.stringify([{
      summarizedActivitiesExport: [{
        activityId: 9, name: "Lunch Ride", activityType: "road_biking", beginTimestamp: 1735725600000,
        distance: 4210000, duration: 5400000, movingDuration: 5100000, elevationGain: 35000,
      }],
    }]);
    const [ride] = parseGarminActivities(json);
    assert.deepEqual(ride, {
      id: "9", name: "Lunch Ride", type: "Road biking", sport: "ride", start: 1735725600000,
      distance: 42100, movingTime: 5100, elevationGain: 350, file: null,
    });
  });
});

describe("sports", () => {
  test("groups Strava and Garmin types", () => {
    const cases = {
      "Trail Run": "run", treadmill_running: "run", "Virtual Ride": "ride", "E-Bike Ride": "ride",
      mountain_biking: "ride", lap_swimming: "swim", Hike: "hike", walking: "walk", "Weight Training": "other",
    };
    for (const [type, sport] of Object.entries(cases)) assert.equal(sportOf(type), sport, type);
  });
});

describe("tracks", () => {
  const points = straightTrack({ start: Date.UTC(2025, 4, 1, 8), seconds: 120, speed: 3, every: 5 });

  test("decodes FIT records, including compressed timestamps", () => {
    const decoded = decodeFit(fit(points, 1));
    assert.equal(decoded.sport, "running");
    assert.equal(decoded.points.length, points.length);
    for (const [i, point] of decoded.points.entries()) {
      assert.ok(Math.abs(point.lat - points[i].lat) < 1e-6);
      assert.equal(point.time, points[i].time);
    }
  });

  test("rejects files without the FIT signature", () => {
    assert.throws(() => decodeFit(new Uint8Array(20)), /Not a FIT/);
  });

  test("reads GPX and TCX points", () => {
    const fromGpx = parseGpx(gpx(points, "running"));
    assert.equal(fromGpx.points.length, points.length);
    assert.equal(fromGpx.sport, "running");

    const tcx = `  <?xml version="1.0"?><TrainingCenterDatabase><Activities><Activity Sport="Biking"><Lap><Track>
      <Trackpoint><Time>2025-05-01T08:00:00Z</Time><Position><LatitudeDegrees>-23.5</LatitudeDegrees><LongitudeDegrees>-46.6</LongitudeDegrees></Position></Trackpoint>
      <Trackpoint><Time>2025-05-01T08:00:05Z</Time></Trackpoint>
    </Track></Lap></Activity></Activities></TrainingCenterDatabase>`;
    assert.deepEqual(parseTcx(tcx), { sport: "biking", points: [{ lat: -23.5, lon: -46.6, time: Date.UTC(2025, 4, 1, 8) }] });
  });
});
