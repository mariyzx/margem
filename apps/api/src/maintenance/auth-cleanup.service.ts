import { Inject, Injectable, Logger } from "@nestjs/common";
import { Cron } from "@nestjs/schedule";
import type Redis from "ioredis";
import { REDIS_CLIENT } from "../health/redis.health";
import { envSchema } from "../config/env";
import { SecurityEventsService, utcDay } from "../observability/security-events.service";
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

const retentionEnvSchema = envSchema.pick({ AUDIT_RETENTION_DAYS: true });

export interface AuthCleanupResult {
  skipped: boolean;
  magicLinkTokens: number;
  sessions: number;
  auditLogs: number;
}

/** Counters grouped by their first segment: `rate_limited.default` -> { rate_limited: { default } }. */
export type DailySummary = Record<string, number | Record<string, number>>;

/** Always present in the summary, even at zero, so a quiet day reads as "0" and not "missing". */
const SUMMARY_DEFAULTS: DailySummary = {
  magic_link: { sent: 0, email_limited: 0, global_cap: 0 },
  rate_limited: {},
  csrf_blocked: 0,
  quota_exceeded: {},
  magic_link_verify_failed: {},
  google_failed: {},
};

export function groupCounters(raw: Record<string, number>): DailySummary {
  const summary: DailySummary = structuredClone(SUMMARY_DEFAULTS);
  for (const [field, value] of Object.entries(raw)) {
    const dot = field.indexOf(".");
    if (dot < 0) {
      summary[field] = value;
      continue;
    }
    const group = field.slice(0, dot);
    const existing = summary[group];
    const bucket = typeof existing === "object" ? existing : {};
    bucket[field.slice(dot + 1)] = value;
    summary[group] = bucket;
  }
  return summary;
}

@Injectable()
export class AuthCleanupService {
  private readonly logger = new Logger(AuthCleanupService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly securityEvents: SecurityEventsService,
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
      return { skipped: true, magicLinkTokens: 0, sessions: 0, auditLogs: 0 };
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

    // LGPD: AuditLog keeps ipHash/userAgent, so it has a bounded retention too.
    const retentionDays = retentionEnvSchema.parse(process.env).AUDIT_RETENTION_DAYS;
    const auditCutoff = new Date(now.getTime() - retentionDays * DAY_MS);
    const auditLogs = await this.deleteInBatches(
      (take) =>
        this.prisma.auditLog.findMany({
          where: { createdAt: { lt: auditCutoff } },
          select: { id: true },
          take,
        }),
      (ids) => this.prisma.auditLog.deleteMany({ where: { id: { in: ids } } }),
    );

    this.logger.log(
      { magicLinkTokens, sessions, auditLogs, durationMs: Date.now() - startedAt },
      "maintenance.auth_cleanup_done",
    );

    await this.emitDailySummary(now);
    return { skipped: false, magicLinkTokens, sessions, auditLogs };
  }

  /**
   * Logs yesterday's (UTC) abuse counters as one `security.daily_summary` line, then
   * deletes them. The job runs at 06:30 UTC, so yesterday is a closed day.
   */
  private async emitDailySummary(now: Date): Promise<void> {
    const day = utcDay(new Date(now.getTime() - DAY_MS));
    try {
      const counters = groupCounters(await this.securityEvents.readDay(day));
      this.logger.log({ day, ...counters }, "security.daily_summary");
      await this.securityEvents.clearDay(day);
    } catch (error) {
      this.logger.error(
        { day, err: error instanceof Error ? error.message : "unknown" },
        "security.daily_summary_failed",
      );
    }
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
