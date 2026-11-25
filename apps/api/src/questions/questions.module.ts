// apps/api/src/questions/questions.module.ts
import { Module } from "@nestjs/common";
import { PoliciesModule } from "../policies/policies.module";
import { QuestionsController } from "./questions.controller";
import { QuestionsService } from "./questions.service";

@Module({
  imports: [PoliciesModule],
  controllers: [QuestionsController],
  providers: [QuestionsService],
})
export class QuestionsModule {}
