import { Module } from "@nestjs/common";
import { PoliciesModule } from "../policies/policies.module";
import { AiSettingsController } from "./ai-settings.controller";
import { AiSettingsService } from "./ai-settings.service";

@Module({
  imports: [PoliciesModule],
  controllers: [AiSettingsController],
  providers: [AiSettingsService],
})
export class AiModule {}
