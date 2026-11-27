// apps/api/src/questions/questions.module.ts
import { Module } from "@nestjs/common";
import { AiModule } from "../ai/ai.module";
import { PoliciesModule } from "../policies/policies.module";
import { QuestionsController } from "./questions.controller";
import { QuestionSuggestionsService } from "./question-suggestions.service";
import { QuestionsService } from "./questions.service";

@Module({
  imports: [PoliciesModule, AiModule],
  controllers: [QuestionsController],
  providers: [QuestionsService, QuestionSuggestionsService],
})
export class QuestionsModule {}
