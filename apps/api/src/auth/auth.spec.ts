import { Logger, type MiddlewareConsumer, Module, type NestModule } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { Test } from "@nestjs/testing";
import cookieParser from "cookie-parser";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { REDIS_CLIENT } from "../health/redis.health";
import { PoliciesModule } from "../policies/policies.module";
import { PrismaService } from "../prisma/prisma.service";
import { AuthController } from "./auth.controller";
import { AuthService, hashToken } from "./auth.service";
import { MailerService } from "./mailer.service";
import { SessionGuard } from "./session.guard";
import { PolicyGuard } from "../policies/policy.guard";
import { FakeRedis } from "../testing/fake-redis";
import { RequestContextMiddleware } from "../security/request-context";
import { hashEmailForLogs } from "../security/client-fingerprint";
import { AuditService } from "../observability/audit.service";
import { SecurityEventsService } from "../observability/security-events.service";
import { ThrottlerModule } from "@nestjs/throttler";
import { ALLOWED_ORIGIN } from "../security/csrf-origin.guard";
import { GLOBAL_GUARDS } from "../security/security.module";
import { createThrottlers } from "../security/throttlers";

const APP_ORIGIN = "http://localhost:3000";

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
    {
      id: string;
      userId: string;
      tokenHash: string;
      expiresAt: Date;
      revokedAt: Date | null;
      seq: number;
    }
  >();
  type AuditRow = {
    userId?: string | null;
    action: string;
    metadata?: Record<string, unknown>;
    ipHash?: string;
    userAgent?: string | null;
  };
  const auditLogs: AuditRow[] = [];
  let failAuditWrites = false;
  const sentEmails: Array<{ email: string; url: string }> = [];
  const authAccounts = new Map<
    string,
    { id: string; userId: string; provider: string; providerAccountId: string }
  >();
  const redis = new FakeRedis();

  beforeEach(() => {
    users.clear();
    tokens.clear();
    sessions.clear();
    auditLogs.length = 0;
    failAuditWrites = false;
    sentEmails.length = 0;
    process.env.DATABASE_URL = "postgresql://margem:margem@localhost:5432/margem";
    process.env.REDIS_URL = "redis://localhost:6379";
    authAccounts.clear();
    redis.clear();
    delete process.env.MAGIC_LINK_DAILY_CAP;
    process.env.APP_URL = "http://localhost:3000";
    process.env.GOOGLE_CLIENT_ID = "google-client-id";
    process.env.GOOGLE_CLIENT_SECRET = "google-client-secret";
    process.env.GOOGLE_REDIRECT_URI = "http://localhost:3001/auth/google/callback";
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  /**
   * `productionGuards: true` wires the exact GLOBAL_GUARDS used in production (CSRF,
   * throttler, session, policy) instead of only session + policy.
   */
  async function createApp({ productionGuards = false } = {}) {
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
            where: { tokenHash?: string; email?: string; usedAt: null; expiresAt: { gt: Date } };
            data: { usedAt: Date };
          }) => {
            let count = 0;
            for (const rec of tokens.values()) {
              if (where.tokenHash !== undefined && rec.tokenHash !== where.tokenHash) continue;
              if (where.email !== undefined && rec.email !== where.email) continue;
              if (rec.usedAt !== null || rec.expiresAt <= where.expiresAt.gt) continue;
              rec.usedAt = data.usedAt;
              count++;
            }
            return { count };
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
            const seq = sessions.size + 1;
            const s = { id: `sess-${seq}`, ...data, revokedAt: null, seq };
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
        findMany: vi.fn(
          async ({
            where,
            skip = 0,
          }: {
            where: { userId: string; revokedAt: null; expiresAt: { gt: Date } };
            skip?: number;
          }) =>
            [...sessions.values()]
              .filter(
                (s) =>
                  s.userId === where.userId &&
                  s.revokedAt === null &&
                  s.expiresAt > where.expiresAt.gt,
              )
              .sort((a, b) => b.seq - a.seq)
              .slice(skip)
              .map((s) => ({ id: s.id })),
        ),
        updateMany: vi.fn(
          async ({
            where,
            data,
          }: {
            where: { id?: string | { in: string[] }; userId?: string; revokedAt?: null };
            data: { revokedAt: Date };
          }) => {
            const matchesId = (id: string) =>
              where.id === undefined ||
              (typeof where.id === "string" ? id === where.id : where.id.in.includes(id));
            let count = 0;
            for (const s of sessions.values()) {
              if (
                (where.userId === undefined || s.userId === where.userId) &&
                s.revokedAt === null &&
                matchesId(s.id)
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
        create: vi.fn(async ({ data }: { data: AuditRow }) => {
          if (failAuditWrites) throw new Error("audit table unavailable");
          auditLogs.push(data);
          return data;
        }),
      },
      $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(fakePrisma)),
      authAccount: {
        findUnique: vi.fn(
          async ({
            where,
          }: {
            where: { provider_providerAccountId: { provider: string; providerAccountId: string } };
          }) => {
            const key = `${where.provider_providerAccountId.provider}:${where.provider_providerAccountId.providerAccountId}`;
            const acc = authAccounts.get(key);
            if (!acc) return null;
            const user = users.get(acc.userId);
            return user ? { ...acc, user } : null;
          },
        ),
        create: vi.fn(
          async ({
            data,
          }: {
            data: { userId: string; provider: string; providerAccountId: string };
          }) => {
            const acc = { id: `acc-${authAccounts.size + 1}`, ...data };
            authAccounts.set(`${data.provider}:${data.providerAccountId}`, acc);
            return acc;
          },
        ),
      },
    };

    const guards = productionGuards
      ? [{ provide: ALLOWED_ORIGIN, useValue: APP_ORIGIN }, ...GLOBAL_GUARDS]
      : [
          // Same order as GLOBAL_GUARDS in SecurityModule (minus CSRF and throttling).
          { provide: APP_GUARD, useClass: SessionGuard },
          { provide: APP_GUARD, useClass: PolicyGuard },
        ];

    @Module({
      imports: [
        PoliciesModule,
        ...(productionGuards ? [ThrottlerModule.forRoot({ throttlers: createThrottlers() })] : []),
      ],
      controllers: [AuthController],
      providers: [
        AuthService,
        SecurityEventsService,
        AuditService,
        ...guards,
        { provide: PrismaService, useValue: fakePrisma },
        { provide: REDIS_CLIENT, useValue: redis },
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
        consumer.apply(RequestContextMiddleware).forRoutes("*");
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

    expect(auditLogs.map((l) => l.action)).toEqual([
      "auth.magic_link_requested",
      "auth.login",
      "auth.magic_link_verify_failed",
      "auth.logout_all",
    ]);
    await app.close();
  });

  const GENERIC_BODY = {
    ok: true,
    message: "Se o endereço existir, enviamos um link de acesso.",
  };

  function requestLink(app: Awaited<ReturnType<typeof createApp>>, email: string) {
    return request(app.getHttpServer()).post("/auth/magic-link").send({ email });
  }

  function tokenFromEmail(index: number): string {
    return new URL(sentEmails[index]!.url).searchParams.get("token")!;
  }

  /** Only Date is faked: supertest and Nest still need real timers. */
  function freezeClock(iso = "2026-11-25T12:00:00.000Z") {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(iso));
  }

  function advanceClock(ms: number) {
    vi.setSystemTime(new Date(Date.now() + ms));
  }

  it("rejects an expired magic link", async () => {
    const app = await createApp();

    const expiredRaw = "e".repeat(43);
    tokens.set(hashToken(expiredRaw), {
      id: "tok-exp",
      email: "rate@margem.local",
      tokenHash: hashToken(expiredRaw),
      expiresAt: new Date(Date.now() - 1000),
      usedAt: null,
    });

    await request(app.getHttpServer()).post("/auth/verify").send({ token: expiredRaw }).expect(401);
    await request(app.getHttpServer()).post("/auth/verify").send({ token: "short" }).expect(400);

    await app.close();
  });

  it("enforces a 60s cooldown per e-mail with the generic 200 response", async () => {
    freezeClock();
    const app = await createApp();

    expect((await requestLink(app, "cool@margem.local").expect(200)).body).toEqual(GENERIC_BODY);
    expect((await requestLink(app, "cool@margem.local").expect(200)).body).toEqual(GENERIC_BODY);
    expect(sentEmails).toHaveLength(1);

    advanceClock(59_000);
    await requestLink(app, "cool@margem.local").expect(200);
    expect(sentEmails).toHaveLength(1);

    advanceClock(2_000);
    await requestLink(app, "cool@margem.local").expect(200);
    expect(sentEmails).toHaveLength(2);

    await app.close();
  });

  it("caps at 5 sends per hour per normalized e-mail without returning 429", async () => {
    freezeClock();
    const app = await createApp();
    const aliases = [
      "ab@gmail.com",
      "a.b@gmail.com",
      "ab+1@gmail.com",
      "A.B+2@googlemail.com",
      "a.b.+3@gmail.com",
      "ab+6@gmail.com",
    ];

    for (const alias of aliases) {
      const res = await requestLink(app, alias).expect(200);
      expect(res.body).toEqual(GENERIC_BODY);
      advanceClock(61_000);
    }
    expect(sentEmails.map((e) => e.email)).toEqual(aliases.slice(0, 5).map((a) => a.toLowerCase()));

    advanceClock(60 * 60 * 1000);
    await requestLink(app, "ab@gmail.com").expect(200);
    expect(sentEmails).toHaveLength(6);

    await app.close();
  });

  it("treats gmail aliases as the same mailbox but keeps other domains distinct", async () => {
    freezeClock();
    const app = await createApp();

    await requestLink(app, "ab@gmail.com").expect(200);
    await requestLink(app, "a.b+x@gmail.com").expect(200);
    await requestLink(app, "A.B+promo@googlemail.com").expect(200);
    expect(sentEmails).toHaveLength(1);

    await requestLink(app, "ab@outlook.com").expect(200);
    await requestLink(app, "a.b@outlook.com").expect(200);
    await requestLink(app, "ab+x@outlook.com").expect(200);
    expect(sentEmails.map((e) => e.email)).toEqual([
      "ab@gmail.com",
      "ab@outlook.com",
      "a.b@outlook.com",
    ]);

    await app.close();
  });

  it("stops sending after the global daily cap and logs once per hour", async () => {
    process.env.MAGIC_LINK_DAILY_CAP = "2";
    const warn = vi.spyOn(Logger.prototype, "warn").mockImplementation(() => undefined);
    freezeClock("2026-11-25T10:00:00.000Z");
    const app = await createApp();

    await requestLink(app, "one@margem.local").expect(200);
    await requestLink(app, "two@margem.local").expect(200);
    const capped = await requestLink(app, "three@margem.local").expect(200);
    await requestLink(app, "four@margem.local").expect(200);

    expect(capped.body).toEqual(GENERIC_BODY);
    expect(sentEmails.map((e) => e.email)).toEqual(["one@margem.local", "two@margem.local"]);
    expect(tokens.size).toBe(2);

    const capLogs = () =>
      warn.mock.calls.filter((call) => call[1] === "auth.magic_link_global_cap_reached");
    expect(capLogs()).toHaveLength(1);
    expect(JSON.stringify(capLogs()[0])).not.toContain("@");

    const dayKey = "auth:magic:global:2026-11-25";
    expect(await redis.pttl(dayKey)).toBe(48 * 60 * 60 * 1000);

    advanceClock(61 * 60 * 1000);
    await requestLink(app, "five@margem.local").expect(200);
    expect(capLogs()).toHaveLength(2);

    // A new UTC day gets a fresh counter.
    vi.setSystemTime(new Date("2026-11-26T00:00:01.000Z"));
    await requestLink(app, "six@margem.local").expect(200);
    expect(sentEmails.map((e) => e.email)).toContain("six@margem.local");

    await app.close();
  });

  it("invalidates older links for the same e-mail when a new one is issued", async () => {
    freezeClock();
    const app = await createApp();

    await requestLink(app, "multi@margem.local").expect(200);
    advanceClock(61_000);
    await requestLink(app, "multi@margem.local").expect(200);
    expect(sentEmails).toHaveLength(2);

    const [first, second] = [tokenFromEmail(0), tokenFromEmail(1)];
    expect(tokens.get(hashToken(first))!.usedAt).not.toBeNull();

    await request(app.getHttpServer()).post("/auth/verify").send({ token: first }).expect(401);
    await request(app.getHttpServer()).post("/auth/verify").send({ token: second }).expect(200);

    await app.close();
  });

  it("returns an identical response whether or not the e-mail was rate-limited", async () => {
    freezeClock();
    const app = await createApp();

    const sent = await requestLink(app, "same@margem.local");
    const limited = await requestLink(app, "same@margem.local");
    expect(sentEmails).toHaveLength(1);

    const shape = (res: typeof sent) => ({
      status: res.status,
      body: res.body as unknown,
      contentType: res.headers["content-type"],
      contentLength: res.headers["content-length"],
    });
    expect(shape(limited)).toEqual(shape(sent));

    await app.close();
  });

  it("leaves no rate-limit key in Redis without a TTL", async () => {
    freezeClock();
    const app = await createApp();

    await requestLink(app, "ttl@margem.local").expect(200);
    await requestLink(app, "ttl@margem.local").expect(200);
    expect(redis.keys().length).toBeGreaterThan(0);
    expect(redis.keysWithoutTtl()).toEqual([]);

    await app.close();
  });

  it("revokes the oldest session when a login would exceed the active session cap", async () => {
    process.env.MAX_ACTIVE_SESSIONS_PER_USER = "2";
    freezeClock();
    const app = await createApp();
    const cookies: string[][] = [];

    for (let i = 0; i < 3; i++) {
      await requestLink(app, "devices@margem.local").expect(200);
      const res = await request(app.getHttpServer())
        .post("/auth/verify")
        .send({ token: tokenFromEmail(i) })
        .expect(200);
      cookies.push(res.headers["set-cookie"] as unknown as string[]);
      advanceClock(61_000);
    }

    const me = (cookie: string[]) =>
      request(app.getHttpServer()).get("/auth/me").set("Cookie", cookie);
    await me(cookies[0]!).expect(401);
    await me(cookies[1]!).expect(200);
    await me(cookies[2]!).expect(200);
    expect([...sessions.values()].filter((s) => s.revokedAt === null)).toHaveLength(2);

    delete process.env.MAX_ACTIVE_SESSIONS_PER_USER;
    await app.close();
  });

  it("end to end with production guards: login, /auth/me, logout and logout-all", async () => {
    freezeClock();
    const app = await createApp({ productionGuards: true });
    const server = app.getHttpServer();
    const login = async (i: number) => {
      await request(server)
        .post("/auth/magic-link")
        .set("Origin", APP_ORIGIN)
        .send({ email: "flow@margem.local" })
        .expect(200);
      const res = await request(server)
        .post("/auth/verify")
        .set("Origin", APP_ORIGIN)
        .send({ token: tokenFromEmail(i) })
        .expect(200);
      advanceClock(61_000);
      return res.headers["set-cookie"] as unknown as string[];
    };

    // Anonymous: no session, no user.
    await request(server).get("/auth/me").expect(401);

    const first = await login(0);
    const me = await request(server).get("/auth/me").set("Cookie", first).expect(200);
    expect(me.body.user).toMatchObject({ email: "flow@margem.local" });

    // Logout needs a same-origin request (CSRF) and a resolved session.
    await request(server).post("/auth/logout").set("Cookie", first).expect(403);
    await request(server)
      .post("/auth/logout")
      .set("Cookie", first)
      .set("Origin", APP_ORIGIN)
      .expect(200);
    await request(server).get("/auth/me").set("Cookie", first).expect(401);
    expect(auditLogs.map((l) => l.action)).toContain("auth.logout");

    const second = await login(1);
    const third = await login(2);
    await request(server)
      .post("/auth/logout-all")
      .set("Cookie", second)
      .set("Origin", APP_ORIGIN)
      .expect(200);
    await request(server).get("/auth/me").set("Cookie", second).expect(401);
    await request(server).get("/auth/me").set("Cookie", third).expect(401);

    await app.close();
  });

  it("completes Google OAuth with PKCE, sets session cookie and links AuthAccount", async () => {
    const app = await createApp();

    const startRes = await request(app.getHttpServer()).get("/auth/google").expect(302);
    const redirectUrl = new URL(startRes.headers.location as string);
    expect(redirectUrl.origin).toBe("https://accounts.google.com");
    expect(redirectUrl.searchParams.get("code_challenge_method")).toBe("S256");
    const state = redirectUrl.searchParams.get("state")!;
    const stateCookies = startRes.headers["set-cookie"] as unknown as string[];

    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ access_token: "google-access-token" }), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            sub: "google-sub-123",
            email: "Mari@Margem.local",
            email_verified: true,
            name: "Mari",
            picture: "https://example.com/avatar.png",
          }),
          { status: 200 },
        ),
      );

    try {
      const cbRes = await request(app.getHttpServer())
        .get(`/auth/google/callback?code=auth-code-1&state=${encodeURIComponent(state)}`)
        .set("Cookie", stateCookies)
        .expect(302);

      expect(cbRes.headers.location).toBe("http://localhost:3000/");
      const cbCookies = cbRes.headers["set-cookie"] as unknown as string[];
      expect(cbCookies.some((c) => c.includes("margem_session="))).toBe(true);
      expect(authAccounts.has("google:google-sub-123")).toBe(true);

      const meRes = await request(app.getHttpServer())
        .get("/auth/me")
        .set("Cookie", cbCookies)
        .expect(200);
      expect(meRes.body.user.email).toBe("mari@margem.local");
    } finally {
      fetchSpy.mockRestore();
      await app.close();
    }
  });

  it("rejects Google OAuth callback with mismatched state or unverified email", async () => {
    const app = await createApp();

    const startRes = await request(app.getHttpServer()).get("/auth/google").expect(302);
    const state = new URL(startRes.headers.location as string).searchParams.get("state")!;
    const stateCookies = startRes.headers["set-cookie"] as unknown as string[];

    const badStateRes = await request(app.getHttpServer())
      .get("/auth/google/callback?code=auth-code-1&state=wrong-state")
      .set("Cookie", stateCookies)
      .expect(302);
    expect(badStateRes.headers.location).toBe("http://localhost:3000/entrar?error=google");
    expect(auditLogs.at(-1)).toMatchObject({
      action: "auth.google_failed",
      metadata: { reason: "state_mismatch" },
    });

    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ access_token: "google-access-token" }), { status: 200 }),
      )
      .mockResolvedValueOnce(
        new Response(
          JSON.stringify({
            sub: "google-sub-999",
            email: "unverified@margem.local",
            email_verified: false,
          }),
          { status: 200 },
        ),
      );

    try {
      const unverifiedRes = await request(app.getHttpServer())
        .get(`/auth/google/callback?code=auth-code-2&state=${encodeURIComponent(state)}`)
        .set("Cookie", stateCookies)
        .expect(302);
      expect(unverifiedRes.headers.location).toBe("http://localhost:3000/entrar?error=google");
      expect(authAccounts.has("google:google-sub-999")).toBe(false);
      expect(auditLogs.at(-1)).toMatchObject({
        action: "auth.google_failed",
        metadata: { reason: "email_not_verified" },
      });

      // A rejected code exchange is a token_invalid.
      const retry = await request(app.getHttpServer()).get("/auth/google").expect(302);
      const retryState = new URL(retry.headers.location as string).searchParams.get("state")!;
      fetchSpy.mockResolvedValueOnce(new Response("{}", { status: 400 }));
      await request(app.getHttpServer())
        .get(`/auth/google/callback?code=bad-code&state=${encodeURIComponent(retryState)}`)
        .set("Cookie", retry.headers["set-cookie"] as unknown as string[])
        .expect(302);
      expect(auditLogs.at(-1)).toMatchObject({
        action: "auth.google_failed",
        metadata: { reason: "token_invalid" },
      });
    } finally {
      fetchSpy.mockRestore();
      await app.close();
    }
  });

  it("audits each magic link request with its outcome, an e-mail HMAC and the client context", async () => {
    process.env.MAGIC_LINK_DAILY_CAP = "2";
    freezeClock();
    const app = await createApp();
    const send = (email: string) =>
      request(app.getHttpServer())
        .post("/auth/magic-link")
        .set("User-Agent", "AbuseTest/1.0")
        .send({ email })
        .expect(200);

    await send("audit@margem.local"); // sent
    await send("audit@margem.local"); // cooldown -> email_limited
    await send("other@margem.local"); // sent (2/2 of the daily cap)
    await send("third@margem.local"); // global_cap

    const requested = auditLogs.filter((l) => l.action === "auth.magic_link_requested");
    expect(requested.map((l) => l.metadata?.outcome)).toEqual([
      "sent",
      "email_limited",
      "sent",
      "global_cap",
    ]);
    for (const row of requested) {
      expect(row.metadata?.emailHash).toMatch(/^[0-9a-f]{16}$/);
      expect(row.ipHash).toMatch(/^[0-9a-f]{16}$/);
      expect(row.userAgent).toBe("AbuseTest/1.0");
      expect(JSON.stringify(row)).not.toMatch(/@margem\.local|127\.0\.0\.1|::1/);
    }
    expect(requested[0]!.metadata?.emailHash).toBe(requested[1]!.metadata?.emailHash);
    expect(requested[0]!.metadata?.emailHash).not.toBe(requested[2]!.metadata?.emailHash);
    // The runbook script (scripts/hash-email.ts) uses the same helper, so lookups always match.
    expect(requested[0]!.metadata?.emailHash).toBe(hashEmailForLogs("Audit@Margem.local "));

    await app.close();
  });

  it("audits failed verifications with reason invalid, expired or used", async () => {
    freezeClock();
    const app = await createApp();
    const verify = (token: string) =>
      request(app.getHttpServer()).post("/auth/verify").send({ token }).expect(401);

    await verify("i".repeat(43));

    const expired = "x".repeat(43);
    tokens.set(hashToken(expired), {
      id: "tok-expired",
      email: "late@margem.local",
      tokenHash: hashToken(expired),
      expiresAt: new Date(Date.now() - 1000),
      usedAt: null,
    });
    await verify(expired);

    await requestLink(app, "twice@margem.local").expect(200);
    const token = tokenFromEmail(0);
    await request(app.getHttpServer()).post("/auth/verify").send({ token }).expect(200);
    await verify(token);

    expect(
      auditLogs
        .filter((l) => l.action === "auth.magic_link_verify_failed")
        .map((l) => l.metadata?.reason),
    ).toEqual(["invalid", "expired", "used"]);
    // The successful login inside the transaction also carries the client context.
    expect(auditLogs.find((l) => l.action === "auth.login")?.ipHash).toMatch(/^[0-9a-f]{16}$/);

    await app.close();
  });

  it("keeps the login flow working when the audit write fails", async () => {
    const error = vi.spyOn(Logger.prototype, "error").mockImplementation(() => undefined);
    const app = await createApp();
    failAuditWrites = true;

    const res = await requestLink(app, "resilient@margem.local").expect(200);
    await request(app.getHttpServer())
      .post("/auth/verify")
      .send({ token: "n".repeat(43) })
      .expect(401);

    expect(res.body).toEqual(GENERIC_BODY);
    expect(sentEmails).toHaveLength(1);
    expect(error.mock.calls.some((call) => call[1] === "audit.write_failed")).toBe(true);
    await app.close();
  });
});
