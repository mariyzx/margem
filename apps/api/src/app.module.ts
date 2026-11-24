import { LoggerModule } from "nestjs-pino";
import { loadEnv } from "./config/env";
import { createLoggerParams } from "./config/logger.config";
import { HealthModule } from "./health/health.module";
import { PrismaModule } from "./prisma/prisma.module";
import { SecurityModule } from "./security/security.module";
import { PoliciesModule } from "./policies/policies.module";
import { AuthModule } from "./auth/auth.module";
import { type MiddlewareConsumer, Module, type NestModule } from "@nestjs/common";
import { SessionMiddleware } from "./auth/session.middleware";
import { SentryModule } from "@sentry/nestjs/setup";

@Module({
  imports: [
    LoggerModule.forRoot(createLoggerParams(loadEnv())),
    HealthModule,
    PrismaModule,
    SecurityModule,
    PoliciesModule,
    AuthModule,
    SentryModule.forRoot(),
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(SessionMiddleware).forRoutes("*");
  }
}
