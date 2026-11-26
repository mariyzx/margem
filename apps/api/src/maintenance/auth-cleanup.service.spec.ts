import type Redis from "ioredis";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaService } from "../prisma/prisma.service";
import { FakeRedis } from "../testing/fake-redis";
import { SecurityEventsService } from "../observability/security-events.service";
import {
  AUTH_CLEANUP_BATCH_SIZE,
  AUTH_CLEANUP_LOCK_KEY,
  AuthCleanupService,
} from "./auth-cleanup.service";

const NOW = new Date("2026-11-26T06:30:00.000Z");
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;
const ago = (ms: number) => new Date(NOW.getTime() - ms);
const ahead = (ms: number) => new Date(NOW.getTime() + ms);

type TokenRow = { id: string; expiresAt: Date; usedAt: Date | null };
type SessionRow = { id: string; expiresAt: Date };
type AuditRow = { id: string; createdAt: Date };
type DateFilter = { lt: Date };

function matchesLt(value: Date | null, filter: DateFilter | undefined): boolean {
  return filter !== undefined && value !== null && value < filter.lt;
}

/** Minimal Prisma fake that understands the exact queries the job sends. */
function createPrisma(tokens: TokenRow[], sessions: SessionRow[], audits: AuditRow[] = []) {
  const deleteBatches: Array<{ table: string; size: number }> = [];

  const prisma = {
    magicLinkToken: {
      findMany: vi.fn(
        async ({
          where,
          take,
        }: {
          where: { OR: Array<{ expiresAt?: DateFilter; usedAt?: DateFilter }> };
          take: number;
        }) =>
          tokens
            .filter((t) =>
              where.OR.some(
                (cond) =>
                  matchesLt(t.expiresAt, cond.expiresAt) || matchesLt(t.usedAt, cond.usedAt),
              ),
            )
            .slice(0, take)
            .map((t) => ({ id: t.id })),
      ),
      deleteMany: vi.fn(async ({ where }: { where: { id: { in: string[] } } }) => {
        const before = tokens.length;
        tokens.splice(0, tokens.length, ...tokens.filter((t) => !where.id.in.includes(t.id)));
        deleteBatches.push({ table: "magicLinkToken", size: where.id.in.length });
        return { count: before - tokens.length };
      }),
    },
    session: {
      findMany: vi.fn(async ({ where, take }: { where: { expiresAt: DateFilter }; take: number }) =>
        sessions
          .filter((s) => matchesLt(s.expiresAt, where.expiresAt))
          .slice(0, take)
          .map((s) => ({ id: s.id })),
      ),
      deleteMany: vi.fn(async ({ where }: { where: { id: { in: string[] } } }) => {
        const before = sessions.length;
        sessions.splice(0, sessions.length, ...sessions.filter((s) => !where.id.in.includes(s.id)));
        deleteBatches.push({ table: "session", size: where.id.in.length });
        return { count: before - sessions.length };
      }),
    },
    auditLog: {
      findMany: vi.fn(async ({ where, take }: { where: { createdAt: DateFilter }; take: number }) =>
        audits
          .filter((a) => matchesLt(a.createdAt, where.createdAt))
          .slice(0, take)
          .map((a) => ({ id: a.id })),
      ),
      deleteMany: vi.fn(async ({ where }: { where: { id: { in: string[] } } }) => {
        const before = audits.length;
        audits.splice(0, audits.length, ...audits.filter((a) => !where.id.in.includes(a.id)));
        deleteBatches.push({ table: "auditLog", size: where.id.in.length });
        return { count: before - audits.length };
      }),
    },
  };

  return { prisma: prisma as unknown as PrismaService, deleteBatches };
}

describe("AuthCleanupService", () => {
  let redis: FakeRedis;

  beforeEach(() => {
    redis = new FakeRedis();
    delete process.env.AUDIT_RETENTION_DAYS;
  });

  function makeService(prisma: PrismaService) {
    const r = redis as unknown as Redis;
    return new AuthCleanupService(prisma, r, new SecurityEventsService(r));
  }

  it("deletes only tokens expired or used more than 24h ago and sessions expired more than 7 days ago", async () => {
    const tokens: TokenRow[] = [
      { id: "expired-2d", expiresAt: ago(2 * DAY), usedAt: null },
      { id: "used-30h", expiresAt: ago(29 * HOUR), usedAt: ago(30 * HOUR) },
      { id: "expired-1h", expiresAt: ago(HOUR), usedAt: null },
      { id: "used-2h", expiresAt: ahead(10 * 60 * 1000), usedAt: ago(2 * HOUR) },
      { id: "active", expiresAt: ahead(10 * 60 * 1000), usedAt: null },
    ];
    const sessions: SessionRow[] = [
      { id: "expired-8d", expiresAt: ago(8 * DAY) },
      { id: "expired-6d", expiresAt: ago(6 * DAY) },
      { id: "active", expiresAt: ahead(10 * DAY) },
    ];
    const { prisma } = createPrisma(tokens, sessions);
    const service = makeService(prisma);

    const result = await service.run(NOW);

    expect(result).toEqual({ skipped: false, magicLinkTokens: 2, sessions: 1, auditLogs: 0 });
    expect(tokens.map((t) => t.id)).toEqual(["expired-1h", "used-2h", "active"]);
    expect(sessions.map((s) => s.id)).toEqual(["expired-6d", "active"]);
  });

  it("deletes in batches of 1000", async () => {
    const tokens: TokenRow[] = Array.from(
      { length: 2 * AUTH_CLEANUP_BATCH_SIZE + 500 },
      (_, i) => ({
        id: `t-${i}`,
        expiresAt: ago(3 * DAY),
        usedAt: null,
      }),
    );
    const { prisma, deleteBatches } = createPrisma(tokens, []);
    const service = makeService(prisma);

    const result = await service.run(NOW);

    expect(result.magicLinkTokens).toBe(2500);
    expect(tokens).toHaveLength(0);
    expect(deleteBatches.filter((b) => b.table === "magicLinkToken").map((b) => b.size)).toEqual([
      1000, 1000, 500,
    ]);
  });

  it("runs once when two instances fire at the same time (Redis lock)", async () => {
    const tokens: TokenRow[] = [{ id: "old", expiresAt: ago(3 * DAY), usedAt: null }];
    const { prisma } = createPrisma(tokens, []);
    const first = makeService(prisma);
    const second = makeService(prisma);

    const [a, b] = await Promise.all([first.run(NOW), second.run(NOW)]);

    expect([a.skipped, b.skipped].sort()).toEqual([false, true]);
    expect(await redis.pttl(AUTH_CLEANUP_LOCK_KEY)).toBeGreaterThan(0);
    expect(prisma.magicLinkToken.deleteMany).toHaveBeenCalledTimes(1);
  });

  it("logs how many rows were deleted", async () => {
    const { Logger } = await import("@nestjs/common");
    const log = vi.spyOn(Logger.prototype, "log").mockImplementation(() => undefined);
    const { prisma } = createPrisma(
      [{ id: "old", expiresAt: ago(3 * DAY), usedAt: null }],
      [{ id: "old", expiresAt: ago(9 * DAY) }],
    );

    await makeService(prisma).run(NOW);

    const done = log.mock.calls.find((call) => call[1] === "maintenance.auth_cleanup_done");
    expect(done?.[0]).toMatchObject({ magicLinkTokens: 1, sessions: 1 });
    log.mockRestore();
  });

  it("deletes AuditLog older than AUDIT_RETENTION_DAYS (default 90) in batches", async () => {
    const audits: AuditRow[] = [
      ...Array.from({ length: AUTH_CLEANUP_BATCH_SIZE + 1 }, (_, i) => ({
        id: `old-${i}`,
        createdAt: ago(91 * DAY),
      })),
      { id: "day-89", createdAt: ago(89 * DAY) },
      { id: "today", createdAt: ago(HOUR) },
    ];
    const { prisma, deleteBatches } = createPrisma([], [], audits);

    const result = await makeService(prisma).run(NOW);

    expect(result.auditLogs).toBe(AUTH_CLEANUP_BATCH_SIZE + 1);
    expect(audits.map((a) => a.id)).toEqual(["day-89", "today"]);
    expect(deleteBatches.filter((b) => b.table === "auditLog").map((b) => b.size)).toEqual([
      1000, 1,
    ]);
  });

  it("honours a custom AUDIT_RETENTION_DAYS", async () => {
    process.env.AUDIT_RETENTION_DAYS = "30";
    const audits: AuditRow[] = [
      { id: "day-31", createdAt: ago(31 * DAY) },
      { id: "day-29", createdAt: ago(29 * DAY) },
    ];
    const { prisma } = createPrisma([], [], audits);

    await makeService(prisma).run(NOW);

    expect(audits.map((a) => a.id)).toEqual(["day-29"]);
  });

  it("logs yesterday's counters as security.daily_summary and then clears them", async () => {
    const { Logger } = await import("@nestjs/common");
    const log = vi.spyOn(Logger.prototype, "log").mockImplementation(() => undefined);
    const events = new SecurityEventsService(redis as unknown as Redis);
    const yesterday = new Date("2026-11-25T15:00:00.000Z");
    for (const field of [
      "magic_link.sent",
      "magic_link.sent",
      "magic_link.email_limited",
      "rate_limited.default",
      "rate_limited.global-ip",
      "rate_limited.global-ip",
      "csrf_blocked",
      "quota_exceeded.notes",
      "magic_link_verify_failed.expired",
      "google_failed.state_mismatch",
    ]) {
      await events.count(field, yesterday);
    }
    await events.count("magic_link.sent", NOW); // today: must not be in the summary
    const { prisma } = createPrisma([], []);

    await makeService(prisma).run(NOW);

    const summary = log.mock.calls.find((call) => call[1] === "security.daily_summary");
    expect(summary?.[0]).toEqual({
      day: "2026-11-25",
      magic_link: { sent: 2, email_limited: 1, global_cap: 0 },
      rate_limited: { default: 1, "global-ip": 2 },
      csrf_blocked: 1,
      quota_exceeded: { notes: 1 },
      magic_link_verify_failed: { expired: 1 },
      google_failed: { state_mismatch: 1 },
    });
    expect(await events.readDay("2026-11-25")).toEqual({});
    expect(await events.readDay("2026-11-26")).toEqual({ "magic_link.sent": 1 });
    log.mockRestore();
  });
});
