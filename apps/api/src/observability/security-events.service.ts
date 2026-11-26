import { Inject, Injectable, Logger } from "@nestjs/common";
import type Redis from "ioredis";
import { REDIS_CLIENT } from "../health/redis.health";

/** One log per (event, ipHash, route) in this window; the rest only bump counters. */
export const SECURITY_LOG_SAMPLE_SEC = 5 * 60;
/** Safety TTL for the daily counters; the cleanup job deletes them after the summary. */
const DAILY_COUNTER_TTL_SEC = 3 * 24 * 60 * 60;

export type SecurityEvent = "rate_limited" | "csrf_blocked" | "quota_exceeded";

export interface SecurityEventFields {
  /** Stable route label (`Controller.handler`), never a URL with ids or query. */
  route: string;
  ipHash: string;
  [extra: string]: string | number | undefined;
}

/** UTC day key, `YYYY-MM-DD`. */
export function utcDay(date: Date = new Date()): string {
  return date.toISOString().slice(0, 10);
}

export function dailyCounterKey(day: string): string {
  return `security:daily:${day}`;
}

/**
 * Abuse signals that must stay readable during an attack: each event is counted every
 * time (Redis hash per UTC day, read by the daily summary) but logged at most once per
 * client and route every 5 minutes. Never throws: losing a metric must not turn into a
 * 500 for the user.
 */
@Injectable()
export class SecurityEventsService {
  private readonly logger = new Logger("Security");

  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async count(field: string, now: Date = new Date()): Promise<void> {
    const key = dailyCounterKey(utcDay(now));
    try {
      await this.redis
        .multi()
        .hincrby(key, field, 1)
        .expire(key, DAILY_COUNTER_TTL_SEC, "NX")
        .exec();
    } catch (error) {
      this.logger.error(
        { field, err: error instanceof Error ? error.message : "unknown" },
        "security.counter_failed",
      );
    }
  }

  async report(
    event: SecurityEvent,
    fields: SecurityEventFields,
    counterField: string = event,
  ): Promise<void> {
    await this.count(counterField);
    try {
      const first = await this.redis.set(
        `security:logged:${event}:${fields.ipHash}:${fields.route}`,
        "1",
        "EX",
        SECURITY_LOG_SAMPLE_SEC,
        "NX",
      );
      if (first !== null) {
        this.logger.warn(fields, `security.${event}`);
      }
    } catch (error) {
      this.logger.error(
        { event, err: error instanceof Error ? error.message : "unknown" },
        "security.report_failed",
      );
    }
  }

  async readDay(day: string): Promise<Record<string, number>> {
    const raw = (await this.redis.hgetall(dailyCounterKey(day))) as Record<string, string>;
    return Object.fromEntries(Object.entries(raw).map(([field, value]) => [field, Number(value)]));
  }

  async clearDay(day: string): Promise<void> {
    await this.redis.del(dailyCounterKey(day));
  }
}
