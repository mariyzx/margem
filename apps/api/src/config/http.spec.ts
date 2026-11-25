import { createServer } from "node:http";
import { Body, Controller, HttpCode, Post } from "@nestjs/common";
import type { NestExpressApplication } from "@nestjs/platform-express";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { applyBodyLimits, applyServerTimeouts, HTTP_TIMEOUTS } from "./http";

@Controller("echo")
class EchoController {
  @Post()
  @HttpCode(200)
  echo(@Body() body: { text?: string }) {
    return { length: body.text?.length ?? 0 };
  }
}

describe("HTTP limits", () => {
  async function createApp() {
    const moduleRef = await Test.createTestingModule({ controllers: [EchoController] }).compile();
    const app = moduleRef.createNestApplication<NestExpressApplication>();
    applyBodyLimits(app);
    await app.init();
    return app;
  }

  it("accepts a JSON body under 1mb and rejects one over it with 413", async () => {
    const app = await createApp();
    const server = app.getHttpServer();

    const small = await request(server)
      .post("/echo")
      .send({ text: "a".repeat(900_000) })
      .expect(200);
    expect(small.body).toEqual({ length: 900_000 });

    await request(server)
      .post("/echo")
      .send({ text: "a".repeat(1_100_000) })
      .expect(413);

    await app.close();
  });

  it("rejects an urlencoded body over 1mb with 413", async () => {
    const app = await createApp();

    await request(app.getHttpServer())
      .post("/echo")
      .type("form")
      .send(`text=${"a".repeat(1_100_000)}`)
      .expect(413);

    await app.close();
  });

  it("sets header, request and keep-alive timeouts on the HTTP server", () => {
    const server = createServer();
    applyServerTimeouts(server);

    expect(server.headersTimeout).toBe(15_000);
    expect(server.requestTimeout).toBe(45_000);
    expect(server.keepAliveTimeout).toBe(65_000);
    expect(HTTP_TIMEOUTS.keepAliveTimeoutMs).toBeGreaterThan(60_000);
    server.close();
  });
});
