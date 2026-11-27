import { Inject, Injectable, Logger } from "@nestjs/common";
import type { ThrottlerStorage } from "@nestjs/throttler";
import type Redis from "ioredis";
import { REDIS_CLIENT } from "../health/redis.health";
import { incrementWithTtl } from "./redis-counter";

@Injectable()
export class RedisThrottlerStorage implements ThrottlerStorage {
  private readonly logger = new Logger(RedisThrottlerStorage.name);

  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async increment(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ) {
    try {
      return await this.count(key, ttl, limit, blockDuration, throttlerName);
    } catch (error) {
      this.logger.warn(
        { throttler: throttlerName, error: error instanceof Error ? error.message : String(error) },
        "security.rate_limit_unavailable",
      );
      return {
        totalHits: 0,
        timeToExpire: Math.max(1, Math.ceil(ttl / 1000)),
        isBlocked: false,
        timeToBlockExpire: 0,
      };
    }
  }

  private async count(
    key: string,
    ttl: number,
    limit: number,
    blockDuration: number,
    throttlerName: string,
  ) {
    const redisKey = `throttle:${throttlerName}:${key}`;
    const blockKey = `throttle:block:${throttlerName}:${key}`;

    const blockedTtl = await this.redis.pttl(blockKey);
    if (blockedTtl > 0) {
      return {
        totalHits: limit + 1,
        timeToExpire: Math.ceil(blockedTtl / 1000),
        isBlocked: true,
        timeToBlockExpire: Math.ceil(blockedTtl / 1000),
      };
    }

    const { count: totalHits, pttlMs } = await incrementWithTtl(this.redis, redisKey, ttl);
    const timeToExpire = Math.max(1, Math.ceil(pttlMs / 1000));

    let isBlocked = false;
    let timeToBlockExpire = 0;

    if (totalHits > limit && blockDuration > 0) {
      await this.redis.set(blockKey, "1", "PX", blockDuration);
      isBlocked = true;
      timeToBlockExpire = Math.ceil(blockDuration / 1000);
    }

    return {
      totalHits,
      timeToExpire,
      isBlocked,
      timeToBlockExpire,
    };
  }
}
