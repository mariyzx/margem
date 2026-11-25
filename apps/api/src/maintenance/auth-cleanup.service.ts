import { Inject, Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import type Redis from "ioredis";
import { REDIS_CLIENT } from "../health/redis.health";
import { PrismaService } from "../prisma/prisma.service";

const DAY_MS = 24 * 60 * 60 * 1000;

export const AUTH_CLEANUP_BATCH_SIZE = 1000;
/** Magic link tokens are kept 24h after they expire or are used, for auditing. */
export const MAGIC_LINK_RETENTION_MS = DAY_MS;
/** Expired sessions are kept 7 days. */
export const SESSION_RETENTION_MS = 7 * DAY_MS;
export const AUTH_CLEANUP_LOCK_KEY = "lock:maintenance:auth-cleanup";
/** Long enough to cover a slow run; short enough to free the lock before the next day. */
const LOCK_TTL_SEC = 30 * 60;

export interface AuthCleanupResult {
  skipped: boolean;
  magicLinkTokens: number;
  sessions: number;
}

@Injectable()
export class AuthCleanupService {
  private readonly logger = new Logger(AuthCleanupService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  /** 03:30 in São Paulo, after the 03:00 backup. */
  @Cron("30 3 * * *", { name: "auth-cleanup", timeZone: "America/Sao_Paulo" })
  async runScheduled(): Promise<void> {
    try {
      await this.run();
    } catch (error) {
      this.logger.error(
        { err: error instanceof Error ? error.message : "unknown" },
        "maintenance.auth_cleanup_failed",
      );
    }
  }

  async run(now: Date = new Date()): Promise<AuthCleanupResult> {
    // SET NX: with more than one API instance, only one runs the job. The lock is not
    // released on purpose: it expires on its own, well before tomorrow's run.
    const acquired = await this.redis.set(AUTH_CLEANUP_LOCK_KEY, "1", "EX", LOCK_TTL_SEC, "NX");
    if (acquired === null) {
      this.logger.log("maintenance.auth_cleanup_skipped_locked");
      return { skipped: true, magicLinkTokens: 0, sessions: 0 };
    }

    const startedAt = Date.now();
    const tokenCutoff = new Date(now.getTime() - MAGIC_LINK_RETENTION_MS);
    const sessionCutoff = new Date(now.getTime() - SESSION_RETENTION_MS);

    const magicLinkTokens = await this.deleteInBatches(
      (take) =>
        this.prisma.magicLinkToken.findMany({
          where: { OR: [{ expiresAt: { lt: tokenCutoff } }, { usedAt: { lt: tokenCutoff } }] },
          select: { id: true },
          take,
        }),
      (ids) => this.prisma.magicLinkToken.deleteMany({ where: { id: { in: ids } } }),
    );

    const sessions = await this.deleteInBatches(
      (take) =>
        this.prisma.session.findMany({
          where: { expiresAt: { lt: sessionCutoff } },
          select: { id: true },
          take,
        }),
      (ids) => this.prisma.session.deleteMany({ where: { id: { in: ids } } }),
    );

    this.logger.log(
      { magicLinkTokens, sessions, durationMs: Date.now() - startedAt },
      "maintenance.auth_cleanup_done",
    );
    return { skipped: false, magicLinkTokens, sessions };
  }

  /**
   * Deletes in batches of AUTH_CLEANUP_BATCH_SIZE so a large backlog never becomes one
   * long transaction holding locks on a hot table.
   */
  private async deleteInBatches(
    findBatch: (take: number) => Promise<Array<{ id: string }>>,
    deleteIds: (ids: string[]) => Promise<{ count: number }>,
  ): Promise<number> {
    let total = 0;
    for (;;) {
      const batch = await findBatch(AUTH_CLEANUP_BATCH_SIZE);
      if (batch.length === 0) {
        return total;
      }
      const { count } = await deleteIds(batch.map((row) => row.id));
      total += count;
      if (batch.length < AUTH_CLEANUP_BATCH_SIZE) {
        return total;
      }
    }
  }
}
