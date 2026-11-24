import { Module } from "@nestjs/common";
import { LoggerModule } from "nestjs-pino";
import { loadEnv } from "./config/env";
import { createLoggerParams } from "./config/logger.config";
import { HealthModule } from "./health/health.module";

@Module({
  imports: [LoggerModule.forRoot(createLoggerParams(loadEnv())), HealthModule],
})
export class AppModule {}
