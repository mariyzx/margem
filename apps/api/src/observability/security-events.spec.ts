import { Controller, Get, Logger, Post, UnprocessableEntityException } from "@nestjs/common";
import { APP_GUARD, APP_INTERCEPTOR } from "@nestjs/core";
import { Test } from "@nestjs/testing";
import { ThrottlerModule } from "@nestjs/throttler";
import type Redis from "ioredis";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { REDIS_CLIENT } from "../health/redis.health";
import { assertWithinQuota } from "../quotas/quota";
import { ALLOWED_ORIGIN, CsrfOriginGuard } from "../security/csrf-origin.guard";
import { LoggingThrottlerGuard } from "../security/logging-throttler.guard";
import { QuotaEventsInterceptor } from "../security/quota-events.interceptor";
import { createThrottlers } from "../security/throttlers";
import { FakeRedis } from "../testing/fake-redis";
import { dailyCounterKey, SecurityEventsService, utcDay } from "./security-events.service";

@Controller("probe")
class ProbeController {
  @Get()
  read() {
    return { ok: true };
  }

  @Post()
  write() {
    return { ok: true };
  }

  @Post("quota")
  quota() {
    process.env.MAX_NOTES_PER_USER = "1";
    assertWithinQuota("notes", 1);
  }

  @Post("other-422")
  other() {
    throw new UnprocessableEntityException("not a quota");
  }
}

describe("SecurityEventsService", () => {
  let redis: FakeRedis;
  let events: SecurityEventsService;
  let warn: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    redis = new FakeRedis();
    events = new SecurityEventsService(redis as unknown as Redis);
    warn = vi.spyOn(Logger.prototype, "warn").mockImplementation(() => undefined);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
    delete process.env.MAX_NOTES_PER_USER;
  });

  const logsOf = (message: string): unknown[][] =>
    (warn.mock.calls as unknown[][]).filter((call) => call[1] === message);

  it("logs the first event per (ipHash, route) every 5 minutes but counts all of them", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-26T12:00:00Z"));
    const fields = {
      route: "AuthController.requestMagicLink",
      ipHash: "aaaa",
      throttler: "default",
    };

    for (let i = 0; i < 50; i++) {
      await events.report("rate_limited", fields, "rate_limited.default");
    }
    await events.report("rate_limited", { ...fields, route: "NotesController.create" });
    await events.report("rate_limited", { ...fields, ipHash: "bbbb" });

    expect(logsOf("security.rate_limited")).toHaveLength(3);
    expect(await events.readDay("2026-11-26")).toEqual({
      "rate_limited.default": 50,
      rate_limited: 2,
    });

    vi.setSystemTime(new Date("2026-11-26T12:05:01Z"));
    await events.report("rate_limited", fields, "rate_limited.default");
    expect(logsOf("security.rate_limited")).toHaveLength(4);
  });

  it("gives the daily counter a TTL so it never lingers", async () => {
    await events.count("csrf_blocked");
    const ttl = await redis.pttl(dailyCounterKey(utcDay()));
    expect(ttl).toBeGreaterThan(0);
    expect(redis.keysWithoutTtl()).toEqual([]);
  });

  it("never throws when Redis fails", async () => {
    const broken = {
      multi: () => {
        throw new Error("redis down");
      },
      set: () => Promise.reject(new Error("redis down")),
    } as unknown as Redis;
    const error = vi.spyOn(Logger.prototype, "error").mockImplementation(() => undefined);

    await expect(
      new SecurityEventsService(broken).report("csrf_blocked", { route: "r", ipHash: "h" }),
    ).resolves.toBeUndefined();
    expect(error).toHaveBeenCalled();
  });

  describe("wired into guards and the quota interceptor", () => {
    async function createApp() {
      const moduleRef = await Test.createTestingModule({
        imports: [
          ThrottlerModule.forRoot({
            throttlers: createThrottlers({ defaultPerRoute: 2, globalPerIp: 1000 }),
          }),
        ],
        controllers: [ProbeController],
        providers: [
          { provide: REDIS_CLIENT, useValue: redis },
          { provide: ALLOWED_ORIGIN, useValue: "http://localhost:3000" },
          SecurityEventsService,
          { provide: APP_GUARD, useClass: CsrfOriginGuard },
          { provide: APP_GUARD, useClass: LoggingThrottlerGuard },
          { provide: APP_INTERCEPTOR, useClass: QuotaEventsInterceptor },
        ],
      }).compile();
      const app = moduleRef.createNestApplication();
      await app.init();
      return app;
    }

    it("reports each 429 with the throttler name and ipHash, logging once", async () => {
      const app = await createApp();
      const server = app.getHttpServer();

      await request(server).get("/probe").expect(200);
      await request(server).get("/probe").expect(200);
      for (let i = 0; i < 4; i++) {
        await request(server).get("/probe").expect(429);
      }

      const logs = logsOf("security.rate_limited");
      expect(logs).toHaveLength(1);
      expect(logs[0]![0]).toMatchObject({
        route: "ProbeController.read",
        throttler: "default",
        ipHash: expect.stringMatching(/^[0-9a-f]{16}$/),
      });
      const logged = JSON.stringify(logs[0]);
      expect(logged).not.toMatch(/127\.0\.0\.1|::1/);
      expect((await events.readDay(utcDay()))["rate_limited.default"]).toBe(4);
      await app.close();
    });

    it("reports CSRF blocks with a reason", async () => {
      const app = await createApp();

      await request(app.getHttpServer())
        .post("/probe")
        .set("Origin", "https://evil.example")
        .expect(403);

      expect(logsOf("security.csrf_blocked")[0]![0]).toMatchObject({
        route: "ProbeController.write",
        reason: "foreign_origin",
      });
      expect((await events.readDay(utcDay())).csrf_blocked).toBe(1);
      await app.close();
    });

    it("reports quota 422s by resource and ignores other 422s", async () => {
      const app = await createApp();
      const server = app.getHttpServer();

      await request(server).post("/probe/quota").set("Origin", "http://localhost:3000").expect(422);
      await request(server)
        .post("/probe/other-422")
        .set("Origin", "http://localhost:3000")
        .expect(422);

      const logs = logsOf("security.quota_exceeded");
      expect(logs).toHaveLength(1);
      expect(logs[0]![0]).toMatchObject({ route: "ProbeController.quota", resource: "notes" });
      expect((await events.readDay(utcDay()))["quota_exceeded.notes"]).toBe(1);
      await app.close();
    });
  });
});
