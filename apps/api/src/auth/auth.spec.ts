import { type MiddlewareConsumer, Module, type NestModule } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import cookieParser from "cookie-parser";
import request from "supertest";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { REDIS_CLIENT } from "../health/redis.health";
import { PoliciesModule } from "../policies/policies.module";
import { PrismaService } from "../prisma/prisma.service";
import { AuthController } from "./auth.controller";
import { AuthService, hashToken } from "./auth.service";
import { MailerService } from "./mailer.service";
import { SessionMiddleware } from "./session.middleware";

describe("Magic link authentication", () => {
  const users = new Map<
    string,
    { id: string; email: string; name: string | null; avatarUrl: string | null }
  >();
  const tokens = new Map<
    string,
    { id: string; email: string; tokenHash: string; expiresAt: Date; usedAt: Date | null }
  >();
  const sessions = new Map<
    string,
    { id: string; userId: string; tokenHash: string; expiresAt: Date; revokedAt: Date | null }
  >();
  const auditLogs: Array<{ userId?: string; action: string }> = [];
  const redisCounters = new Map<string, number>();
  const sentEmails: Array<{ email: string; url: string }> = [];

  beforeEach(() => {
    users.clear();
    tokens.clear();
    sessions.clear();
    auditLogs.length = 0;
    redisCounters.clear();
    sentEmails.length = 0;
    process.env.DATABASE_URL = "postgresql://margem:margem@localhost:5432/margem";
    process.env.REDIS_URL = "redis://localhost:6379";
  });

  async function createApp() {
    const fakePrisma = {
      magicLinkToken: {
        create: vi.fn(
          async ({ data }: { data: { email: string; tokenHash: string; expiresAt: Date } }) => {
            const rec = { id: `tok-${tokens.size + 1}`, ...data, usedAt: null };
            tokens.set(data.tokenHash, rec);
            return rec;
          },
        ),
        updateMany: vi.fn(
          async ({
            where,
            data,
          }: {
            where: { tokenHash: string; usedAt: null; expiresAt: { gt: Date } };
            data: { usedAt: Date };
          }) => {
            const rec = tokens.get(where.tokenHash);
            if (!rec || rec.usedAt !== null || rec.expiresAt <= where.expiresAt.gt) {
              return { count: 0 };
            }
            rec.usedAt = data.usedAt;
            return { count: 1 };
          },
        ),
        findUnique: vi.fn(
          async ({ where }: { where: { tokenHash: string } }) =>
            tokens.get(where.tokenHash) ?? null,
        ),
      },
      user: {
        upsert: vi.fn(
          async ({ where, create }: { where: { email: string }; create: { email: string } }) => {
            let user = [...users.values()].find((u) => u.email === where.email);
            if (!user) {
              user = {
                id: `user-${users.size + 1}`,
                email: create.email,
                name: null,
                avatarUrl: null,
              };
              users.set(user.id, user);
            }
            return user;
          },
        ),
      },
      session: {
        create: vi.fn(
          async ({ data }: { data: { userId: string; tokenHash: string; expiresAt: Date } }) => {
            const s = { id: `sess-${sessions.size + 1}`, ...data, revokedAt: null };
            sessions.set(data.tokenHash, s);
            return s;
          },
        ),
        findUnique: vi.fn(async ({ where }: { where: { tokenHash: string } }) => {
          const s = sessions.get(where.tokenHash);
          if (!s) return null;
          const user = users.get(s.userId);
          return user ? { ...s, user } : null;
        }),
        updateMany: vi.fn(
          async ({
            where,
            data,
          }: {
            where: { id?: string; userId: string; revokedAt: null };
            data: { revokedAt: Date };
          }) => {
            let count = 0;
            for (const s of sessions.values()) {
              if (
                s.userId === where.userId &&
                s.revokedAt === null &&
                (!where.id || s.id === where.id)
              ) {
                s.revokedAt = data.revokedAt;
                count++;
              }
            }
            return { count };
          },
        ),
      },
      auditLog: {
        create: vi.fn(async ({ data }: { data: { userId?: string; action: string } }) => {
          auditLogs.push(data);
          return data;
        }),
      },
      $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(fakePrisma)),
    };

    const fakeRedis = {
      incr: vi.fn(async (key: string) => {
        const next = (redisCounters.get(key) ?? 0) + 1;
        redisCounters.set(key, next);
        return next;
      }),
      expire: vi.fn(async () => 1),
    };

    @Module({
      imports: [PoliciesModule],
      controllers: [AuthController],
      providers: [
        AuthService,
        SessionMiddleware,
        { provide: PrismaService, useValue: fakePrisma },
        { provide: REDIS_CLIENT, useValue: fakeRedis },
        {
          provide: MailerService,
          useValue: {
            sendMagicLink: vi.fn(async (email: string, url: string) => {
              sentEmails.push({ email, url });
            }),
          },
        },
      ],
    })
    class TestAuthModule implements NestModule {
      configure(consumer: MiddlewareConsumer) {
        consumer.apply(SessionMiddleware).forRoutes("*");
      }
    }

    const moduleRef = await Test.createTestingModule({
      imports: [TestAuthModule],
    }).compile();

    const app = moduleRef.createNestApplication();
    app.use(cookieParser());
    await app.init();
    return app;
  }

  it("hashes magic link token, enforces single-use, sets HttpOnly cookie and supports logout-all", async () => {
    const app = await createApp();

    const reqRes = await request(app.getHttpServer())
      .post("/auth/magic-link")
      .send({ email: "Mari@Margem.local" })
      .expect(200);
    expect(reqRes.body.ok).toBe(true);
    expect(sentEmails).toHaveLength(1);

    const rawToken = new URL(sentEmails[0]!.url).searchParams.get("token")!;
    expect(rawToken.length).toBeGreaterThanOrEqual(32);
    expect(tokens.has(hashToken(rawToken))).toBe(true);
    expect(tokens.has(rawToken)).toBe(false);

    const verifyRes = await request(app.getHttpServer())
      .post("/auth/verify")
      .send({ token: rawToken })
      .expect(200);
    expect(verifyRes.body.user.email).toBe("mari@margem.local");
    const cookies = verifyRes.headers["set-cookie"] as unknown as string[];
    expect(cookies[0]).toContain("HttpOnly");
    expect(cookies[0]).toContain("SameSite=Lax");

    await request(app.getHttpServer()).post("/auth/verify").send({ token: rawToken }).expect(401);

    await request(app.getHttpServer()).get("/auth/me").expect(401);
    const meRes = await request(app.getHttpServer())
      .get("/auth/me")
      .set("Cookie", cookies)
      .expect(200);
    expect(meRes.body.user.email).toBe("mari@margem.local");

    await request(app.getHttpServer()).post("/auth/logout-all").set("Cookie", cookies).expect(200);
    await request(app.getHttpServer()).get("/auth/me").set("Cookie", cookies).expect(401);

    expect(auditLogs.map((l) => l.action)).toEqual(["auth.login", "auth.logout_all"]);
    await app.close();
  });

  it("rejects expired magic link and rate-limits after 5 requests per email", async () => {
    const app = await createApp();

    for (let i = 0; i < 5; i++) {
      await request(app.getHttpServer())
        .post("/auth/magic-link")
        .send({ email: "rate@margem.local" })
        .expect(200);
    }
    await request(app.getHttpServer())
      .post("/auth/magic-link")
      .send({ email: "rate@margem.local" })
      .expect(429);

    const expiredRaw = "expired-token-sample";
    tokens.set(hashToken(expiredRaw), {
      id: "tok-exp",
      email: "rate@margem.local",
      tokenHash: hashToken(expiredRaw),
      expiresAt: new Date(Date.now() - 1000),
      usedAt: null,
    });

    await request(app.getHttpServer()).post("/auth/verify").send({ token: expiredRaw }).expect(401);

    await app.close();
  });
});
