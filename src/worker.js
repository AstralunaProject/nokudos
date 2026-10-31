import { loadExport } from "./load.js";

/** @typedef {{ type: "progress", done: number, total: number } | { type: "done", data: import("./load.js").ExportData } | { type: "error", message: string }} WorkerMessage */

const scope = /** @type {DedicatedWorkerGlobalScope} */ (/** @type {unknown} */ (self));

scope.addEventListener("message", async (event) => {
  /** @param {WorkerMessage} message */
  const send = (message) => scope.postMessage(message);
  let last = 0;
  try {
    const data = await loadExport(event.data, (done, total) => {
      const now = Date.now();
      if (done === total || now - last > 100) {
        last = now;
        send({ type: "progress", done, total });
      }
    });
    send({ type: "done", data });
  } catch (error) {
    send({ type: "error", message: error instanceof Error ? error.message : String(error) });
  }
});
