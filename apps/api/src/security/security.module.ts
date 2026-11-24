import { Module } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { ThrottlerGuard, ThrottlerModule } from "@nestjs/throttler";
import { loadEnv } from "../config/env";
import { HealthModule } from "../health/health.module";
import { ALLOWED_ORIGIN, CsrfOriginGuard } from "./csrf-origin.guard";
import { RedisThrottlerStorage } from "./redis-throttler.storage";
import type Redis from "ioredis";
import { REDIS_CLIENT } from "../health/redis.health";

@Module({
  imports: [
    HealthModule,

    ThrottlerModule.forRootAsync({
      imports: [HealthModule],
      inject: [REDIS_CLIENT],
      useFactory: (redis: Redis) => ({
        throttlers: [{ name: "default", ttl: 60_000, limit: 60 }],
        storage: new RedisThrottlerStorage(redis),
      }),
    }),
  ],
  providers: [
    {
      provide: ALLOWED_ORIGIN,
      useFactory: () => loadEnv().APP_URL,
    },
    RedisThrottlerStorage,
    { provide: APP_GUARD, useClass: CsrfOriginGuard },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
  exports: [ALLOWED_ORIGIN, RedisThrottlerStorage],
})
export class SecurityModule {}
