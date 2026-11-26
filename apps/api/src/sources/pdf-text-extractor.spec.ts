import { describe, expect, it } from "vitest";
import { runPdfWorker } from "./pdf-text-extractor";

const OPTIONS = { timeoutMs: 1_000, maxHeapMb: 32 };

function run(evalSource: string, options = OPTIONS) {
  return runPdfWorker("unused", new Uint8Array([1, 2, 3]), { ...options, evalSource });
}

describe("runPdfWorker", () => {
  it("returns the pages the worker posts", async () => {
    const pages = await run(`
      const { parentPort, workerData } = require("node:worker_threads");
      parentPort.postMessage({ ok: true, pages: [{ num: 1, text: "bytes " + workerData.length }] });
    `);
    expect(pages).toEqual([{ num: 1, text: "bytes 3" }]);
  });

  it("terminates a worker stuck in CPU-bound work once the timeout passes", async () => {
    const startedAt = Date.now();
    await expect(run("for (;;) {}", { ...OPTIONS, timeoutMs: 300 })).rejects.toThrow(
      "PDF parsing timed out",
    );
    // The main thread stayed free: the timer fired on time despite the infinite loop.
    expect(Date.now() - startedAt).toBeLessThan(2_000);
  });

  it("fails with a clear reason when the worker exceeds its heap cap", async () => {
    await expect(
      run(
        `
        const hog = [];
        for (;;) hog.push(new Array(1e5).fill({ x: Math.random() }));
      `,
        { ...OPTIONS, timeoutMs: 10_000 },
      ),
    ).rejects.toThrow("PDF parsing ran out of memory");
  });

  it("propagates the parser error message without the stack", async () => {
    await expect(
      run(`
        const { parentPort } = require("node:worker_threads");
        parentPort.postMessage({ ok: false, error: "Invalid PDF structure" });
      `),
    ).rejects.toThrow("PDF parsing failed: Invalid PDF structure");
  });
});
