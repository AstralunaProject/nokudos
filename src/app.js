import { CARD, drawCard } from "./card.js";
import { calendar, monthBars } from "./charts.js";
import { clock, distance, effortLabel, elevation, hours, pace, speed } from "./format.js";
import { drawRoutes, focusBounds } from "./heatmap.js";
import { SPORT_LABELS, SPORTS } from "./sports.js";
import { review, uniqueTracks, yearsOf } from "./stats.js";

/**
 * @typedef {import("./load.js").ExportData} ExportData
 * @typedef {import("./format.js").Units} Units
 * @typedef {import("./sports.js").Sport} Sport
 * @typedef {import("./worker.js").WorkerMessage} WorkerMessage
 */

/**
 * @template {typeof HTMLElement} T
 * @param {string} id @param {T} type
 * @returns {InstanceType<T>}
 */
function element(id, type) {
  const found = document.getElementById(id);
  if (!(found instanceof type)) throw new Error(`#${id} is missing`);
  return /** @type {InstanceType<T>} */ (found);
}

const ACCENT = "#ff7a45";
const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const start = element("start", HTMLElement);
const reviewSection = element("review", HTMLElement);
const fileInput = element("file", HTMLInputElement);
const drop = element("drop", HTMLLabelElement);
const progress = element("progress", HTMLDivElement);
const bar = element("bar", HTMLProgressElement);
const progressText = element("progressText", HTMLParagraphElement);
const errorBox = element("error", HTMLParagraphElement);
const yearSelect = element("year", HTMLSelectElement);
const sportSelect = element("sport", HTMLSelectElement);
const unitsSelect = element("units", HTMLSelectElement);
const note = element("note", HTMLParagraphElement);
const map = element("map", HTMLCanvasElement);
const card = element("card", HTMLCanvasElement);
const shareButton = element("share", HTMLButtonElement);

/** @type {ExportData | null} */
let data = null;

/** @returns {Units} */
function savedUnits() {
  try {
    return localStorage.getItem("units") === "imperial" ? "imperial" : "metric";
  } catch {
    return "metric";
  }
}
unitsSelect.value = savedUnits();

/** @param {string} message */
function fail(message) {
  progress.hidden = true;
  errorBox.textContent = message;
  errorBox.hidden = false;
}

/** @param {ExportData} loaded */
function show(loaded) {
  if (loaded.activities.length === 0) {
    fail("The export has no activities.");
    return;
  }
  data = loaded;
  progress.hidden = true;
  sportSelect.replaceChildren();
  const years = yearsOf(loaded.activities);
  yearSelect.replaceChildren(...years.map((y) => new Option(String(y), String(y))));
  const lastFullYear = new Date().getFullYear() - 1;
  yearSelect.value = String(years.includes(lastFullYear) && new Date().getMonth() < 11 ? lastFullYear : years[0]);
  note.hidden = loaded.skipped === 0;
  note.textContent = `${loaded.skipped} track file(s) could not be read and were left out of the map and bests.`;
  start.hidden = true;
  reviewSection.hidden = false;
  render();
  reviewSection.scrollIntoView({ behavior: "smooth" });
}

/** @param {File} file */
function load(file) {
  errorBox.hidden = true;
  progress.hidden = false;
  bar.removeAttribute("value");
  progressText.textContent = "Opening the archive…";
  const worker = new Worker(new URL("./worker.js", import.meta.url), { type: "module" });
  worker.addEventListener("message", (/** @type {MessageEvent<WorkerMessage>} */ event) => {
    const message = event.data;
    if (message.type === "progress") {
      bar.max = Math.max(1, message.total);
      bar.value = message.done;
      progressText.textContent = `Reading routes: ${message.done.toLocaleString("en-US")} of ${message.total.toLocaleString("en-US")}`;
      return;
    }
    worker.terminate();
    if (message.type === "error") fail(message.message);
    else show(message.data);
  });
  worker.addEventListener("error", () => {
    worker.terminate();
    fail("This browser could not read the file. Try a recent Chrome, Edge, Firefox or Safari.");
  });
  worker.postMessage(file);
}

function render() {
  if (!data) return;
  const year = Number(yearSelect.value);
  const units = /** @type {Units} */ (unitsSelect.value);
  const inYear = data.activities.filter((a) => new Date(a.start).getFullYear() === year);
  const present = SPORTS.filter((s) => inYear.some((a) => a.sport === s));
  const chosen = sportSelect.value;
  sportSelect.replaceChildren(new Option("All", "all"), ...present.map((s) => new Option(SPORT_LABELS[s], s)));
  sportSelect.value = present.includes(/** @type {Sport} */ (chosen)) ? chosen : "all";
  const sport = /** @type {Sport | "all"} */ (sportSelect.value);

  const r = review(data.activities, data.tracks, { year, sport });
  const tracks = uniqueTracks(data.tracks.filter((t) => new Date(t.start).getFullYear() === year && (sport === "all" || t.sport === sport)));

  element("nDistance", HTMLElement).textContent = distance(r.distance, units);
  element("nTime", HTMLElement).textContent = hours(r.movingTime);
  element("nElevation", HTMLElement).textContent = elevation(r.elevationGain, units);
  element("nCount", HTMLElement).textContent = r.count.toLocaleString("en-US");
  element("nDays", HTMLElement).textContent = String(r.activeDays);
  element("nStreak", HTMLElement).textContent = `${r.longestStreak} day${r.longestStreak === 1 ? "" : "s"}`;
  const compare = element("nCompare", HTMLElement);
  if (r.previousDistance > 0) {
    const change = Math.round(((r.distance - r.previousDistance) / r.previousDistance) * 100);
    compare.textContent = `${change >= 0 ? "+" : ""}${change}% vs ${year - 1}`;
    compare.className = change >= 0 ? "up" : "";
  } else {
    compare.textContent = "";
  }

  const ctx = map.getContext("2d");
  const bounds = focusBounds(tracks);
  if (ctx) {
    ctx.fillStyle = "#090a12";
    ctx.fillRect(0, 0, map.width, map.height);
    if (bounds) drawRoutes(ctx, tracks, bounds, { x: 0, y: 0, width: map.width, height: map.height, color: ACCENT });
  }
  element("mapNote", HTMLParagraphElement).textContent = bounds
    ? `${tracks.length.toLocaleString("en-US")} routes, zoomed on where most of them start.`
    : "No GPS tracks for this selection.";

  element("months", HTMLDivElement).replaceChildren(monthBars(r.months, (meters) => distance(meters, units, 1)));
  element("calendar", HTMLDivElement).replaceChildren(calendar(year, r.days));

  const sportsTable = element("sports", HTMLTableElement);
  sportsTable.replaceChildren();
  const head = sportsTable.createTHead().insertRow();
  for (const title of ["Sport", "Activities", "Distance", "Time"]) head.append(Object.assign(document.createElement("th"), { textContent: title }));
  const body = sportsTable.createTBody();
  for (const total of r.bySport) {
    const row = body.insertRow();
    const covered = total.distance > 0 ? distance(total.distance, units) : "—";
    for (const value of [SPORT_LABELS[total.sport], String(total.count), covered, hours(total.movingTime)]) {
      row.insertCell().textContent = value;
    }
  }

  /** @param {HTMLUListElement} list @param {[string, string][]} items @param {string} empty */
  const fill = (list, items, empty) => {
    list.replaceChildren(
      ...(items.length ? items : [[empty, ""]]).map(([label, value]) => {
        const li = document.createElement("li");
        li.append(Object.assign(document.createElement("span"), { textContent: label }), Object.assign(document.createElement("strong"), { textContent: value }));
        return li;
      }),
    );
  };

  /** @type {[string, string][]} */
  const bests = [];
  for (const [name, list] of /** @type {[Sport, import("./stats.js").Effort[]][]} */ (Object.entries(r.efforts))) {
    for (const effort of list) {
      const detail = name === "run" ? pace(effort.seconds, effort.distance, units) : speed(effort.seconds, effort.distance, units);
      bests.push([`${SPORT_LABELS[name]} · ${effortLabel(effort.distance)}`, `${clock(effort.seconds)} (${detail})`]);
    }
  }
  fill(element("efforts", HTMLUListElement), bests, "No GPS tracks with enough distance");

  /** @type {[string, string][]} */
  const highlights = [];
  if (r.longest) highlights.push(["Longest", `${distance(r.longest.distance, units, 1)} · ${r.longest.name || r.longest.type}`]);
  if (r.biggestClimb) highlights.push(["Biggest climb", `${elevation(r.biggestClimb.elevationGain, units)} · ${r.biggestClimb.name || r.biggestClimb.type}`]);
  if (r.favoriteWeekday !== null) highlights.push(["Favorite day", WEEKDAYS[r.favoriteWeekday]]);
  if (r.count) highlights.push(["Average per active day", hours(r.movingTime / Math.max(1, r.activeDays))]);
  fill(element("highlights", HTMLUListElement), highlights, "Nothing this year yet");

  drawCard(card, { review: r, tracks, units, sport, accent: ACCENT });
}

/** @returns {Promise<File | null>} */
function cardFile() {
  return new Promise((resolve) => {
    card.toBlob((blob) => resolve(blob && new File([blob], `nokudos-${yearSelect.value}.png`, { type: "image/png" })), "image/png");
  });
}

fileInput.addEventListener("change", () => {
  const file = fileInput.files?.[0];
  if (file) load(file);
});
drop.addEventListener("dragover", (event) => {
  event.preventDefault();
  drop.classList.add("over");
});
drop.addEventListener("dragleave", () => drop.classList.remove("over"));
drop.addEventListener("drop", (event) => {
  event.preventDefault();
  drop.classList.remove("over");
  const file = event.dataTransfer?.files[0];
  if (file) load(file);
});

element("demo", HTMLButtonElement).addEventListener("click", async () => {
  const { demoExport } = await import("./demo.js");
  show(demoExport(new Date().getFullYear() - 1));
});
element("reset", HTMLButtonElement).addEventListener("click", () => {
  data = null;
  fileInput.value = "";
  reviewSection.hidden = true;
  start.hidden = false;
});

yearSelect.addEventListener("change", render);
sportSelect.addEventListener("change", render);
unitsSelect.addEventListener("change", () => {
  try {
    localStorage.setItem("units", unitsSelect.value);
  } catch {}
  render();
});

element("download", HTMLButtonElement).addEventListener("click", async () => {
  const file = await cardFile();
  if (!file) return;
  const link = Object.assign(document.createElement("a"), { href: URL.createObjectURL(file), download: file.name });
  link.click();
  setTimeout(() => URL.revokeObjectURL(link.href), 1000);
});

shareButton.hidden = !("canShare" in navigator);
shareButton.addEventListener("click", async () => {
  const file = await cardFile();
  if (!file || !navigator.canShare?.({ files: [file] })) return;
  try {
    await navigator.share({ files: [file], title: `My ${yearSelect.value} in motion` });
  } catch {}
});

card.width = CARD.width;
card.height = CARD.height;
