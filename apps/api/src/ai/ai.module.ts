import { Module } from "@nestjs/common";
import { HealthModule } from "../health/health.module";
import { PoliciesModule } from "../policies/policies.module";
import { AiRateLimit } from "./ai-rate-limit";
import { AiSettingsController } from "./ai-settings.controller";
import { AiSettingsService } from "./ai-settings.service";
import { AiService } from "./ai.service";
import { AiProviderClient } from "./provider-client";

@Module({
  imports: [PoliciesModule, HealthModule],
  controllers: [AiSettingsController],
  providers: [AiSettingsService, AiService, AiProviderClient, AiRateLimit],
  exports: [AiService],
})
export class AiModule {}
