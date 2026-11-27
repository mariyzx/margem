// apps/api/src/questions/questions.module.ts
import { Module } from "@nestjs/common";
import { AiModule } from "../ai/ai.module";
import { PoliciesModule } from "../policies/policies.module";
import { QuestionsController } from "./questions.controller";
import { QuestionAiService } from "./question-ai.service";
import { QuestionSuggestionsService } from "./question-suggestions.service";
import { QuestionsService } from "./questions.service";

@Module({
  imports: [PoliciesModule, AiModule],
  controllers: [QuestionsController],
  providers: [QuestionsService, QuestionSuggestionsService, QuestionAiService],
})
export class QuestionsModule {}
