import { Module } from "@nestjs/common";
import { LoggerModule } from "nestjs-pino";
import { loadEnv } from "./config/env";
import { createLoggerParams } from "./config/logger.config";
import { HealthModule } from "./health/health.module";
import { PrismaModule } from "./prisma/prisma.module";
import { SecurityModule } from "./security/security.module";
import { PoliciesModule } from "./policies/policies.module";

@Module({
  imports: [
    LoggerModule.forRoot(createLoggerParams(loadEnv())),
    HealthModule,
    PrismaModule,
    SecurityModule,
    PoliciesModule,
  ],
})
export class AppModule {}
