/** Small SVG charts built with the DOM, so they scale, print and follow the page colors. */

const SVG = "http://www.w3.org/2000/svg";
const MONTHS = ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];
const DAY_MS = 86_400_000;

/**
 * @template {keyof SVGElementTagNameMap} K
 * @param {K} name @param {Record<string, string | number>} attributes @param {string} [text]
 */
function node(name, attributes, text) {
  const element = document.createElementNS(SVG, name);
  for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, String(value));
  if (text !== undefined) element.textContent = text;
  return element;
}

/** @param {number[]} values @param {(value: number) => string} label */
export function monthBars(values, label) {
  const width = 600;
  const height = 220;
  const top = Math.max(...values, 1);
  const svg = node("svg", { viewBox: `0 0 ${width} ${height}`, role: "img", class: "chart" });
  svg.append(node("title", {}, "Distance per month"));
  const slot = width / 12;
  values.forEach((value, index) => {
    const barHeight = Math.max(value > 0 ? 3 : 0, (value / top) * (height - 50));
    const x = index * slot + slot * 0.18;
    const bar = node("rect", { x, y: height - 24 - barHeight, width: slot * 0.64, height: barHeight, rx: 4, class: "bar" });
    bar.append(node("title", {}, label(value)));
    svg.append(bar, node("text", { x: x + slot * 0.32, y: height - 6, "text-anchor": "middle", class: "axis" }, MONTHS[index]));
  });
  return svg;
}

/**
 * GitHub-style calendar: one column per week, Monday on top.
 * @param {number} year @param {Map<string, number>} days seconds per local date
 */
export function calendar(year, days) {
  const cell = 11;
  const gap = 3;
  const first = new Date(year, 0, 1);
  const offset = (first.getDay() + 6) % 7;
  const weeks = Math.ceil((offset + (Date.UTC(year + 1, 0, 1) - Date.UTC(year, 0, 1)) / DAY_MS) / 7);
  const svg = node("svg", { viewBox: `0 0 ${weeks * (cell + gap)} ${7 * (cell + gap)}`, role: "img", class: "calendar" });
  svg.append(node("title", {}, "Active days"));
  const values = [...days.values()].sort((a, b) => a - b);
  /** @param {number} q */
  const level = (q) => values[Math.floor(q * (values.length - 1))] ?? 0;
  const steps = [level(0.25), level(0.5), level(0.75)];

  for (let date = new Date(first); date.getFullYear() === year; date.setDate(date.getDate() + 1)) {
    const index = offset + Math.round((Date.UTC(year, date.getMonth(), date.getDate()) - Date.UTC(year, 0, 1)) / DAY_MS);
    const key = `${year}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    const seconds = days.get(key) ?? 0;
    const intensity = seconds === 0 ? 0 : 1 + steps.filter((step) => seconds > step).length;
    const square = node("rect", {
      x: Math.floor(index / 7) * (cell + gap),
      y: (index % 7) * (cell + gap),
      width: cell,
      height: cell,
      rx: 2,
      class: `day l${intensity}`,
    });
    square.append(node("title", {}, `${key}: ${seconds ? `${Math.round(seconds / 60)} min` : "rest"}`));
    svg.append(square);
  }
  return svg;
}
