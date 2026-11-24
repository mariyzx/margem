import { Controller, Get, Post } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { Test } from "@nestjs/testing";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import helmet from "helmet";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { ALLOWED_ORIGIN, CsrfOriginGuard } from "./csrf-origin.guard";

@Controller("test-security")
class TestSecurityController {
  @Get()
  read() {
    return { ok: true };
  }

  @Post()
  write() {
    return { ok: true };
  }
}

describe("HTTP security controls", () => {
  async function createTestApp(limit = 10) {
    const moduleRef = await Test.createTestingModule({
      imports: [
        ThrottlerModule.forRoot({
          throttlers: [{ name: "default", ttl: 60_000, limit }],
        }),
      ],
      controllers: [TestSecurityController],
      providers: [
        { provide: ALLOWED_ORIGIN, useValue: "http://localhost:3000" },
        { provide: APP_GUARD, useClass: CsrfOriginGuard },
        { provide: APP_GUARD, useClass: ThrottlerGuard },
      ],
    }).compile();

    const app = moduleRef.createNestApplication();
    app.use(
      helmet({
        contentSecurityPolicy: {
          directives: { defaultSrc: ["'none'"], frameAncestors: ["'none'"] },
        },
        frameguard: { action: "deny" },
        referrerPolicy: { policy: "strict-origin-when-cross-origin" },
      }),
    );
    await app.init();
    return app;
  }

  it("sets security headers via helmet", async () => {
    const app = await createTestApp();
    const res = await request(app.getHttpServer()).get("/test-security").expect(200);

    expect(res.headers["x-content-type-options"]).toBe("nosniff");
    expect(res.headers["x-frame-options"]).toBe("DENY");
    expect(res.headers["referrer-policy"]).toBe("strict-origin-when-cross-origin");
    expect(res.headers["content-security-policy"]).toContain("frame-ancestors 'none'");
    await app.close();
  });

  it("blocks state-changing requests from foreign origin (CSRF)", async () => {
    const app = await createTestApp();

    await request(app.getHttpServer())
      .post("/test-security")
      .set("Origin", "https://evil.example")
      .expect(403);

    await request(app.getHttpServer())
      .post("/test-security")
      .set("Cookie", "margem_session=abc")
      .expect(403);

    await request(app.getHttpServer())
      .post("/test-security")
      .set("Origin", "http://localhost:3000")
      .expect(201);

    await app.close();
  });

  it("returns 429 when rate limit is exceeded", async () => {
    const app = await createTestApp(2);

    await request(app.getHttpServer()).get("/test-security").expect(200);
    await request(app.getHttpServer()).get("/test-security").expect(200);
    await request(app.getHttpServer()).get("/test-security").expect(429);

    await app.close();
  });
});
