import { distance, elevation, hours } from "./format.js";
import { drawRoutes, focusBounds } from "./heatmap.js";
import { SPORT_LABELS } from "./sports.js";

/**
 * @typedef {import("./stats.js").Review} Review
 * @typedef {import("./geo.js").Track} Track
 * @typedef {import("./format.js").Units} Units
 */

export const CARD = { width: 1080, height: 1350 };

/**
 * Portrait card sized for Instagram and Strava posts.
 * @param {HTMLCanvasElement} canvas
 * @param {{ review: Review, tracks: Track[], units: Units, sport: string, accent: string }} input
 */
export function drawCard(canvas, { review, tracks, units, sport, accent }) {
  canvas.width = CARD.width;
  canvas.height = CARD.height;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const background = ctx.createLinearGradient(0, 0, CARD.width, CARD.height);
  background.addColorStop(0, "#0d0f1a");
  background.addColorStop(1, "#1b1030");
  ctx.fillStyle = background;
  ctx.fillRect(0, 0, CARD.width, CARD.height);

  const bounds = focusBounds(tracks);
  if (bounds) drawRoutes(ctx, tracks, bounds, { x: 60, y: 300, width: 960, height: 620, color: accent, lineWidth: 2.2 });

  const font = (/** @type {number} */ size, weight = 700) => `${weight} ${size}px "Inter", system-ui, sans-serif`;
  ctx.fillStyle = "#ffffff";
  ctx.font = font(120, 800);
  ctx.fillText(String(review.year), 72, 170);
  ctx.font = font(44, 500);
  ctx.fillStyle = "#b9b4d6";
  const subject = sport === "all" ? "in motion" : `of ${SPORT_LABELS[/** @type {import("./sports.js").Sport} */ (sport)].toLowerCase()}s`;
  ctx.fillText(subject, 76, 236);

  const stats = [
    ["Distance", distance(review.distance, units)],
    ["Time", hours(review.movingTime)],
    ["Elevation", elevation(review.elevationGain, units)],
    ["Activities", review.count.toLocaleString("en-US")],
    ["Active days", String(review.activeDays)],
    ["Longest streak", `${review.longestStreak} days`],
  ];
  stats.forEach(([label, value], index) => {
    const x = 72 + (index % 3) * 330;
    const y = 1010 + Math.floor(index / 3) * 150;
    ctx.fillStyle = "#8e88ad";
    ctx.font = font(30, 500);
    ctx.fillText(label.toUpperCase(), x, y);
    ctx.fillStyle = "#ffffff";
    ctx.font = font(54, 800);
    ctx.fillText(value, x, y + 62);
  });

  ctx.fillStyle = accent;
  ctx.font = font(30, 700);
  ctx.textAlign = "right";
  ctx.fillText("nokudos", CARD.width - 72, CARD.height - 50);
  ctx.textAlign = "left";
}
