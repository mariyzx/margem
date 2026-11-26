import path from "node:path";
import { Worker } from "node:worker_threads";

export interface PdfPageText {
  num: number;
  text: string;
}

export const PDF_PARSE_TIMEOUT_MS = 30_000;
/** Heap cap of the parsing thread. A 25 MB PDF parses well below it. */
export const PDF_PARSE_MAX_HEAP_MB = 256;

type WorkerMessage = { ok: true; pages: PdfPageText[] } | { ok: false; error: string };

export interface RunWorkerOptions {
  timeoutMs: number;
  maxHeapMb: number;
  /** Source code to run with `eval: true` instead of a file (tests only). */
  evalSource?: string;
}

/**
 * Runs a worker that answers with one WorkerMessage. Unlike a Promise.race with
 * setTimeout on the main thread, the timer here keeps firing even while the worker is
 * stuck in CPU-bound parsing, and terminate() actually stops that work.
 */
export function runPdfWorker(
  filename: string,
  data: Uint8Array,
  options: RunWorkerOptions,
): Promise<PdfPageText[]> {
  return new Promise((resolve, reject) => {
    const worker = new Worker(options.evalSource ?? filename, {
      eval: options.evalSource !== undefined,
      workerData: data,
      resourceLimits: { maxOldGenerationSizeMb: options.maxHeapMb },
    });

    let settled = false;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      void worker.terminate();
      fn();
    };

    const timer = setTimeout(() => {
      finish(() => reject(new Error("PDF parsing timed out")));
    }, options.timeoutMs);

    worker.once("message", (message: WorkerMessage) => {
      finish(() =>
        message.ok
          ? resolve(message.pages)
          : reject(new Error(`PDF parsing failed: ${message.error}`)),
      );
    });
    worker.once("error", (error: Error & { code?: string }) => {
      const reason =
        error.code === "ERR_WORKER_OUT_OF_MEMORY"
          ? "PDF parsing ran out of memory"
          : "PDF parsing crashed";
      finish(() => reject(new Error(reason)));
    });
    worker.once("exit", (code) => {
      finish(() => reject(new Error(`PDF parsing exited early (code ${code})`)));
    });
  });
}

/** Text of each page of `buffer`, parsed off the main thread. */
export function extractPdfPages(buffer: Buffer): Promise<PdfPageText[]> {
  // Compiled next to this file (dist/sources/pdf-text.worker.js); `nest start` also builds to dist.
  const filename = path.join(__dirname, "pdf-text.worker.js");
  return runPdfWorker(filename, new Uint8Array(buffer), {
    timeoutMs: PDF_PARSE_TIMEOUT_MS,
    maxHeapMb: PDF_PARSE_MAX_HEAP_MB,
  });
}
