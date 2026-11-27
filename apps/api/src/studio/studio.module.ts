import { Module } from "@nestjs/common";
import { AiModule } from "../ai/ai.module";
import { PoliciesModule } from "../policies/policies.module";
import { PracticeService } from "./practice.service";
import { StudioController } from "./studio.controller";

@Module({
  imports: [PoliciesModule, AiModule],
  controllers: [StudioController],
  providers: [PracticeService],
})
export class StudioModule {}
