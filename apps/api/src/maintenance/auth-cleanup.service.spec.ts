import type Redis from "ioredis";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaService } from "../prisma/prisma.service";
import { FakeRedis } from "../testing/fake-redis";
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
type DateFilter = { lt: Date };

function matchesLt(value: Date | null, filter: DateFilter | undefined): boolean {
  return filter !== undefined && value !== null && value < filter.lt;
}

/** Minimal Prisma fake that understands the exact queries the job sends. */
function createPrisma(tokens: TokenRow[], sessions: SessionRow[]) {
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
  };

  return { prisma: prisma as unknown as PrismaService, deleteBatches };
}

describe("AuthCleanupService", () => {
  let redis: FakeRedis;

  beforeEach(() => {
    redis = new FakeRedis();
  });

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
    const service = new AuthCleanupService(prisma, redis as unknown as Redis);

    const result = await service.run(NOW);

    expect(result).toEqual({ skipped: false, magicLinkTokens: 2, sessions: 1 });
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
    const service = new AuthCleanupService(prisma, redis as unknown as Redis);

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
    const first = new AuthCleanupService(prisma, redis as unknown as Redis);
    const second = new AuthCleanupService(prisma, redis as unknown as Redis);

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

    await new AuthCleanupService(prisma, redis as unknown as Redis).run(NOW);

    const done = log.mock.calls.find((call) => call[1] === "maintenance.auth_cleanup_done");
    expect(done?.[0]).toMatchObject({ magicLinkTokens: 1, sessions: 1 });
    log.mockRestore();
  });
});
