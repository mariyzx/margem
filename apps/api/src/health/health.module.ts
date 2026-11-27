import { Inject, Module, type OnApplicationShutdown } from "@nestjs/common";
import { TerminusModule } from "@nestjs/terminus";
import Redis from "ioredis";
import { HealthController } from "./health.controller";
import { REDIS_CLIENT, RedisHealthIndicator } from "./redis.health";
import { PrismaHealthIndicator } from "./prisma.health";

@Module({
  imports: [TerminusModule],
  controllers: [HealthController],
  providers: [
    {
      provide: REDIS_CLIENT,
      useFactory: () => {
        const url = process.env.REDIS_URL ?? "redis://localhost:6379";
        return new Redis(url, { maxRetriesPerRequest: 1, lazyConnect: true });
      },
    },
    RedisHealthIndicator,
    PrismaHealthIndicator,
  ],
  exports: [REDIS_CLIENT],
})
export class HealthModule implements OnApplicationShutdown {
  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async onApplicationShutdown() {
    await this.redis.quit().catch(() => undefined);
  }
}
