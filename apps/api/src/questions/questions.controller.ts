// apps/api/src/questions/questions.controller.ts
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from "@nestjs/common";
import {
  createQuestionSchema,
  explainAnswerSchema,
  gradeAnswersSchema,
  updateQuestionSchema,
} from "@margem/shared";
import type { AuthenticatedRequest } from "../auth/session";
import { parsePagination } from "../common/pagination";
import { RequirePolicy } from "../policies/require-policy.decorator";
import { QuestionAiService } from "./question-ai.service";
import { QuestionSuggestionsService } from "./question-suggestions.service";
import { QuestionsService } from "./questions.service";

@Controller()
export class QuestionsController {
  constructor(
    private readonly questionsService: QuestionsService,
    private readonly suggestions: QuestionSuggestionsService,
    private readonly questionAi: QuestionAiService,
  ) {}

  @Get("notes/:noteId/questions")
  @RequirePolicy("read", "note")
  listForNote(
    @Req() req: AuthenticatedRequest,
    @Param("noteId") noteId: string,
    @Query() query: unknown,
  ) {
    return this.questionsService.listForNote(req.user!.id, noteId, parsePagination(query));
  }

  @Post("notes/:noteId/questions")
  @RequirePolicy("create", "note")
  async create(
    @Req() req: AuthenticatedRequest,
    @Param("noteId") noteId: string,
    @Body() body: unknown,
  ) {
    const parsed = createQuestionSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }
    const question = await this.questionsService.create(req.user!.id, noteId, parsed.data);
    return { question };
  }

  @Post("notes/:noteId/questions/suggestions")
  @RequirePolicy("update", "note")
  suggest(@Req() req: AuthenticatedRequest, @Param("noteId") noteId: string) {
    return this.suggestions.suggest(req.user!.id, noteId);
  }

  @Post("questions/grade")
  @HttpCode(200)
  @RequirePolicy("read", "note")
  grade(@Req() req: AuthenticatedRequest, @Body() body: unknown) {
    const parsed = gradeAnswersSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }
    return this.questionAi.grade(req.user!.id, parsed.data);
  }

  @Post("questions/:id/explain")
  @HttpCode(200)
  @RequirePolicy("read", "note")
  explain(@Req() req: AuthenticatedRequest, @Param("id") id: string, @Body() body: unknown) {
    const parsed = explainAnswerSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }
    return this.questionAi.explain(req.user!.id, id, parsed.data);
  }

  @Post("questions/:id/approve")
  @HttpCode(200)
  @RequirePolicy("update", "note")
  async approve(@Req() req: AuthenticatedRequest, @Param("id") id: string) {
    return { question: await this.questionsService.approve(req.user!.id, id) };
  }

  @Post("questions/:id/discard")
  @HttpCode(200)
  @RequirePolicy("update", "note")
  discard(@Req() req: AuthenticatedRequest, @Param("id") id: string) {
    return this.questionsService.discard(req.user!.id, id);
  }

  @Patch("questions/:id")
  @RequirePolicy("update", "note")
  async update(@Req() req: AuthenticatedRequest, @Param("id") id: string, @Body() body: unknown) {
    const parsed = updateQuestionSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }
    const question = await this.questionsService.update(req.user!.id, id, parsed.data);
    return { question };
  }

  @Delete("questions/:id")
  @RequirePolicy("delete", "note")
  remove(@Req() req: AuthenticatedRequest, @Param("id") id: string) {
    return this.questionsService.remove(req.user!.id, id);
  }
}
