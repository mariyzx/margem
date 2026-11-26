import { Module, type Provider } from "@nestjs/common";
import { APP_GUARD, APP_INTERCEPTOR } from "@nestjs/core";
import { ThrottlerModule } from "@nestjs/throttler";
import type Redis from "ioredis";
import { AuthModule } from "../auth/auth.module";
import { SessionGuard } from "../auth/session.guard";
import { loadEnv } from "../config/env";
import { HealthModule } from "../health/health.module";
import { REDIS_CLIENT } from "../health/redis.health";
import { PolicyGuard } from "../policies/policy.guard";
import { ALLOWED_ORIGIN, CsrfOriginGuard } from "./csrf-origin.guard";
import { LoggingThrottlerGuard } from "./logging-throttler.guard";
import { QuotaEventsInterceptor } from "./quota-events.interceptor";
import { RedisThrottlerStorage } from "./redis-throttler.storage";
import { createThrottlers } from "./throttlers";

/**
 * Every global guard, in the order Nest runs them. Order matters:
 * 1. CsrfOriginGuard and LoggingThrottlerGuard only read headers and Redis.
 * 2. SessionGuard is the first one allowed to touch Postgres, so a request that
 *    gets 403 or 429 never reaches the database.
 * 3. PolicyGuard needs `req.user`, filled by SessionGuard.
 * Keep them all here: guards registered as APP_GUARD in different modules run in
 * module-scan order, which is easy to break by reordering imports.
 */
export const GLOBAL_GUARDS: Provider[] = [
  { provide: APP_GUARD, useClass: CsrfOriginGuard },
  { provide: APP_GUARD, useClass: LoggingThrottlerGuard },
  { provide: APP_GUARD, useClass: SessionGuard },
  { provide: APP_GUARD, useClass: PolicyGuard },
];

@Module({
  imports: [
    HealthModule,
    AuthModule,
    ThrottlerModule.forRootAsync({
      imports: [HealthModule],
      inject: [REDIS_CLIENT],
      useFactory: (redis: Redis) => ({
        throttlers: createThrottlers(),
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
    ...GLOBAL_GUARDS,
    { provide: APP_INTERCEPTOR, useClass: QuotaEventsInterceptor },
  ],
  exports: [ALLOWED_ORIGIN, RedisThrottlerStorage],
})
export class SecurityModule {}
