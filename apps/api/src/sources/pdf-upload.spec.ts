import { createServer, type IncomingMessage, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import type { CallHandler, ExecutionContext } from "@nestjs/common";
import { FileInterceptor } from "@nestjs/platform-express";
import { lastValueFrom, of } from "rxjs";
import { afterEach, describe, expect, it } from "vitest";
import { PDF_UPLOAD_OPTIONS } from "./pdf-validation";

type RequestWithFile = IncomingMessage & { file?: { originalname: string } };

let server: Server | undefined;

afterEach(async () => {
  await new Promise<void>((resolve) => (server ? server.close(() => resolve()) : resolve()));
  server = undefined;
});

async function uploadedName(filename: string): Promise<string | undefined> {
  const Interceptor = FileInterceptor("file", PDF_UPLOAD_OPTIONS);
  const interceptor = new Interceptor();
  const received = new Promise<string | undefined>((resolve, reject) => {
    server = createServer((req, res) => {
      const context = {
        switchToHttp: () => ({ getRequest: () => req, getResponse: () => res }),
      } as unknown as ExecutionContext;
      const next: CallHandler = { handle: () => of(null) };
      Promise.resolve(interceptor.intercept(context, next))
        .then((observable) => lastValueFrom(observable))
        .then(() => {
          resolve((req as RequestWithFile).file?.originalname);
          res.end();
        })
        .catch(reject);
    });
  });
  await new Promise<void>((resolve) => server!.listen(0, "127.0.0.1", resolve));
  const { port } = server!.address() as AddressInfo;
  const form = new FormData();
  form.append("file", new Blob(["%PDF-1.4"], { type: "application/pdf" }), filename);
  await fetch(`http://127.0.0.1:${port}/`, { method: "POST", body: form });
  return received;
}

describe("PDF upload options", () => {
  it.each(["5) RNA-triggered cell killing with CRISPR‑Cas12a2.pdf", "Aula de revisão — ação.pdf"])(
    "keeps the UTF-8 file name %s intact",
    async (filename) => {
      expect(await uploadedName(filename)).toBe(filename);
    },
  );
});
