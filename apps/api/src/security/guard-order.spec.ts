import { Controller, Get } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { Test } from "@nestjs/testing";
import { ThrottlerModule } from "@nestjs/throttler";
import cookieParser from "cookie-parser";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthService } from "../auth/auth.service";
import { MailerService } from "../auth/mailer.service";
import { SESSION_COOKIE_NAME } from "../auth/session";
import { SessionGuard } from "../auth/session.guard";
import { REDIS_CLIENT } from "../health/redis.health";
import { PoliciesModule } from "../policies/policies.module";
import { PolicyGuard } from "../policies/policy.guard";
import { RequirePolicy } from "../policies/require-policy.decorator";
import { PrismaService } from "../prisma/prisma.service";
import { FakeRedis } from "../testing/fake-redis";
import { ALLOWED_ORIGIN, CsrfOriginGuard } from "./csrf-origin.guard";
import { LoggingThrottlerGuard } from "./logging-throttler.guard";
import { AuditService } from "../observability/audit.service";
import { SecurityEventsService } from "../observability/security-events.service";
import { GLOBAL_GUARDS } from "./security.module";
import { createThrottlers } from "./throttlers";

@Controller("probe")
class ProbeController {
  @Get("private")
  @RequirePolicy("read", "user")
  privateRoute() {
    return { ok: true };
  }

  @Get("public")
  publicRoute() {
    return { ok: true };
  }
}

const VALID_LOOKING_TOKEN = "a".repeat(43);

describe("global guard order", () => {
  const sessionFindUnique = vi.fn(async () => null);

  beforeEach(() => {
    sessionFindUnique.mockClear();
  });

  async function createApp(perRouteLimit: number) {
    const moduleRef = await Test.createTestingModule({
      imports: [
        PoliciesModule,
        ThrottlerModule.forRoot({
          throttlers: createThrottlers({ defaultPerRoute: perRouteLimit, globalPerIp: 1000 }),
        }),
      ],
      controllers: [ProbeController],
      providers: [
        AuthService,
        { provide: PrismaService, useValue: { session: { findUnique: sessionFindUnique } } },
        { provide: MailerService, useValue: {} },
        { provide: REDIS_CLIENT, useValue: new FakeRedis() },
        SecurityEventsService,
        AuditService,
        { provide: ALLOWED_ORIGIN, useValue: "http://localhost:3000" },
        ...GLOBAL_GUARDS,
      ],
    }).compile();

    const app = moduleRef.createNestApplication();
    app.use(cookieParser());
    await app.init();
    return app;
  }

  it("registers CSRF, throttler, session and policy guards in this order", () => {
    const classes = GLOBAL_GUARDS.map((provider) => {
      const { provide, useClass } = provider as { provide: unknown; useClass: unknown };
      expect(provide).toBe(APP_GUARD);
      return useClass;
    });
    expect(classes).toEqual([CsrfOriginGuard, LoggingThrottlerGuard, SessionGuard, PolicyGuard]);
  });

  it("answers 429 without touching the session table once the limit is exceeded", async () => {
    const app = await createApp(2);
    const server = app.getHttpServer();
    const cookie = `${SESSION_COOKIE_NAME}=${VALID_LOOKING_TOKEN}`;

    await request(server).get("/probe/private").set("Cookie", cookie).expect(401);
    await request(server).get("/probe/private").set("Cookie", cookie).expect(401);
    expect(sessionFindUnique).toHaveBeenCalledTimes(2);

    for (let i = 0; i < 5; i++) {
      await request(server).get("/probe/private").set("Cookie", cookie).expect(429);
    }
    expect(sessionFindUnique).toHaveBeenCalledTimes(2);

    await app.close();
  });

  it("never looks up the session on public routes or for malformed cookies", async () => {
    const app = await createApp(100);
    const server = app.getHttpServer();

    await request(server)
      .get("/probe/public")
      .set("Cookie", `${SESSION_COOKIE_NAME}=${VALID_LOOKING_TOKEN}`)
      .expect(200);
    await request(server)
      .get("/probe/private")
      .set("Cookie", `${SESSION_COOKIE_NAME}=${"x".repeat(5000)}`)
      .expect(401);

    expect(sessionFindUnique).not.toHaveBeenCalled();
    await app.close();
  });
});
