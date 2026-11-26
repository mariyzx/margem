/**
 * Runs inside a worker_thread (see pdf-text-extractor.ts). pdf.js parses on the thread
 * that calls it, so a hostile PDF would block the API's event loop; here it only blocks
 * this thread, which the parent terminates on timeout or when it hits its heap cap.
 */
import { parentPort, workerData } from "node:worker_threads";
import { PDFParse } from "pdf-parse";
import type { PdfPageText } from "./pdf-text-extractor";

async function run(): Promise<void> {
  const data = workerData as Uint8Array;
  const parser = new PDFParse({ data });
  try {
    const result = await parser.getText();
    const pages: PdfPageText[] = result.pages.map((page) => ({ num: page.num, text: page.text }));
    parentPort?.postMessage({ ok: true, pages });
  } finally {
    await parser.destroy().catch(() => undefined);
  }
}

run().catch((error: unknown) => {
  // Only the message crosses the thread boundary: no stack with file contents.
  const message = error instanceof Error ? error.message : "PDF parsing failed";
  parentPort?.postMessage({ ok: false, error: message.slice(0, 300) });
});
