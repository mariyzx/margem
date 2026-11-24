import { Inject, Injectable } from "@nestjs/common";
import { HealthIndicatorService } from "@nestjs/terminus";
import type Redis from "ioredis";

export const REDIS_CLIENT = Symbol("REDIS_CLIENT");

@Injectable()
export class RedisHealthIndicator {
  constructor(
    private readonly healthIndicatorService: HealthIndicatorService,
    @Inject(REDIS_CLIENT) private readonly redis: Pick<Redis, "ping">,
  ) {}

  async isHealthy(key: string) {
    const indicator = this.healthIndicatorService.check(key);
    try {
      const reply = await this.redis.ping();
      if (reply !== "PONG") {
        return indicator.down({ message: `Unexpected reply: ${reply}` });
      }
      return indicator.up();
    } catch (error) {
      const message = error instanceof Error ? error.message : "Redis unavailable";
      return indicator.down({ message });
    }
  }
}
