import { Inject, Injectable, Logger } from "@nestjs/common";
import type Redis from "ioredis";
import { envSchema } from "../config/env";
import { REDIS_CLIENT } from "../health/redis.health";
import { incrementWithTtl } from "../security/redis-counter";
import { AiUnavailableException } from "./ai-errors";

const WINDOW_MS = 60_000;
const limitEnvSchema = envSchema.pick({ AI_CALLS_PER_MINUTE_PER_USER: true });

@Injectable()
export class AiRateLimit {
  private readonly logger = new Logger(AiRateLimit.name);

  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async consume(userId: string): Promise<void> {
    const limit = limitEnvSchema.parse(process.env).AI_CALLS_PER_MINUTE_PER_USER;
    let count: number;
    try {
      ({ count } = await incrementWithTtl(this.redis, `ai:calls:${userId}`, WINDOW_MS));
    } catch (error) {
      this.logger.warn(
        { error: error instanceof Error ? error.message : String(error) },
        "ai.rate_limit_unavailable",
      );
      return;
    }
    if (count > limit) {
      throw new AiUnavailableException("rate_limited");
    }
  }
}
