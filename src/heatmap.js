/**
 * Draws every route on a canvas, without map tiles: nothing leaves the browser and the
 * routes alone already show the streets a person moves through.
 * @typedef {import("./geo.js").Track} Track
 * @typedef {{ minX: number, minY: number, maxX: number, maxY: number }} Bounds
 */

/** Web Mercator, normalized to [0, 1]. @param {number} lat @param {number} lon */
export function project(lat, lon) {
  const sin = Math.sin((Math.max(-85, Math.min(85, lat)) * Math.PI) / 180);
  return {
    x: (lon + 180) / 360,
    y: 0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI),
  };
}

/** @param {number[]} sorted @param {number} q */
function quantile(sorted, q) {
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor(q * (sorted.length - 1))))];
}

/**
 * Area around where most activities start, trimmed of the 1% most distant points so one trip
 * abroad does not shrink the home routes to a dot.
 * @param {Track[]} tracks
 * @returns {Bounds | null}
 */
export function focusBounds(tracks) {
  const drawn = tracks.filter((t) => t.coords.length >= 4);
  if (drawn.length === 0) return null;
  const cell = 1 / 2 ** 9;
  /** @type {Map<string, number>} */
  const counts = new Map();
  const starts = drawn.map((t) => project(t.coords[0], t.coords[1]));
  for (const { x, y } of starts) {
    const key = `${Math.floor(x / cell)}:${Math.floor(y / cell)}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const [homeX, homeY] = [...counts.entries()].sort((a, b) => b[1] - a[1])[0][0].split(":").map(Number);

  /** @type {number[]} */
  const xs = [];
  /** @type {number[]} */
  const ys = [];
  drawn.forEach((track, index) => {
    const start = starts[index];
    if (Math.abs(Math.floor(start.x / cell) - homeX) > 1 || Math.abs(Math.floor(start.y / cell) - homeY) > 1) return;
    for (let i = 0; i < track.coords.length; i += 2) {
      const { x, y } = project(track.coords[i], track.coords[i + 1]);
      xs.push(x);
      ys.push(y);
    }
  });
  xs.sort((a, b) => a - b);
  ys.sort((a, b) => a - b);
  const bounds = { minX: quantile(xs, 0.01), maxX: quantile(xs, 0.99), minY: quantile(ys, 0.01), maxY: quantile(ys, 0.99) };
  const padX = Math.max((bounds.maxX - bounds.minX) * 0.05, 1e-5);
  const padY = Math.max((bounds.maxY - bounds.minY) * 0.05, 1e-5);
  return { minX: bounds.minX - padX, maxX: bounds.maxX + padX, minY: bounds.minY - padY, maxY: bounds.maxY + padY };
}

/**
 * @param {CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D} ctx
 * @param {Track[]} tracks @param {Bounds} bounds
 * @param {{ x: number, y: number, width: number, height: number, color: string, lineWidth?: number }} area
 */
export function drawRoutes(ctx, tracks, bounds, { x, y, width, height, color, lineWidth = 1.4 }) {
  const scale = Math.min(width / (bounds.maxX - bounds.minX), height / (bounds.maxY - bounds.minY));
  const offsetX = x + (width - (bounds.maxX - bounds.minX) * scale) / 2;
  const offsetY = y + (height - (bounds.maxY - bounds.minY) * scale) / 2;

  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, width, height);
  ctx.clip();
  ctx.globalCompositeOperation = "lighter";
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.globalAlpha = Math.min(0.7, Math.max(0.12, 2.5 / Math.sqrt(tracks.length)));
  for (const track of tracks) {
    ctx.beginPath();
    for (let i = 0; i < track.coords.length; i += 2) {
      const p = project(track.coords[i], track.coords[i + 1]);
      const px = offsetX + (p.x - bounds.minX) * scale;
      const py = offsetY + (p.y - bounds.minY) * scale;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }
    ctx.stroke();
  }
  ctx.restore();
}
