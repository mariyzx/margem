import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import type { ExplainAnswerInput, GradeAnswersInput, GradedAnswerDto } from "@margem/shared";
import { AiService } from "../ai/ai.service";
import {
  buildExplainAfterErrorPrompt,
  MAX_EXPLANATION_CHARS,
} from "../ai/prompts/explain-after-error";
import {
  buildGradeAnswerPrompt,
  gradeAnswerOutputSchema,
  MAX_MISSING_POINT_CHARS,
  MAX_MISSING_POINTS,
} from "../ai/prompts/grade-answer";
import { PrismaService } from "../prisma/prisma.service";

const STUDYABLE = { deletedAt: null, status: "approved" } as const;

@Injectable()
export class QuestionAiService {
  private readonly logger = new Logger(QuestionAiService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiService,
  ) {}

  async grade(userId: string, input: GradeAnswersInput): Promise<{ results: GradedAnswerDto[] }> {
    const questionIds = input.items.map((item) => item.questionId);
    const questions = await this.prisma.question.findMany({
      where: { id: { in: questionIds }, ...STUDYABLE, note: { authorId: userId, deletedAt: null } },
      select: { id: true, text: true, answer: true },
    });
    if (questions.length !== questionIds.length) {
      throw new NotFoundException("Resource not found");
    }

    const byId = new Map(questions.map((question) => [question.id, question]));
    const promptIds = input.items.map((_, index) => `r${index + 1}`);
    const toQuestionId = new Map(promptIds.map((id, index) => [id, questionIds[index]!]));

    const { data, provider } = await this.ai.completeJson(
      userId,
      "grade-answer",
      buildGradeAnswerPrompt(
        input.items.map((item, index) => {
          const question = byId.get(item.questionId)!;
          return {
            id: promptIds[index]!,
            question: question.text,
            expected: question.answer,
            answer: item.answer,
          };
        }),
      ),
      gradeAnswerOutputSchema(promptIds),
    );

    const graded = new Map(
      data.results.map((result) => [
        toQuestionId.get(result.id)!,
        {
          questionId: toQuestionId.get(result.id)!,
          verdict: result.verdict,
          missing: cleanMissing(result.missing),
        },
      ]),
    );
    const results = questionIds.map((id) => graded.get(id)!);

    this.logger.log(
      {
        provider,
        answers: results.length,
        right: results.filter((result) => result.verdict === "right").length,
      },
      "ai.answers_graded",
    );
    return { results };
  }

  async explain(
    userId: string,
    questionId: string,
    input: ExplainAnswerInput,
  ): Promise<{ explanation: string }> {
    const question = await this.prisma.question.findFirst({
      where: { id: questionId, ...STUDYABLE, note: { authorId: userId, deletedAt: null } },
      select: {
        text: true,
        answer: true,
        anchor: { select: { quote: true, prefix: true, suffix: true, deletedAt: true } },
      },
    });
    if (!question) {
      throw new NotFoundException("Resource not found");
    }

    const anchor = question.anchor && !question.anchor.deletedAt ? question.anchor : null;
    const { data, provider } = await this.ai.completeText(
      userId,
      "explain-after-error",
      buildExplainAfterErrorPrompt({
        question: question.text,
        expected: question.answer,
        answer: input.answer,
        context: anchor ? `${anchor.prefix}${anchor.quote}${anchor.suffix}` : undefined,
      }),
    );

    this.logger.log({ provider }, "ai.explanation_created");
    return { explanation: data.slice(0, MAX_EXPLANATION_CHARS) };
  }
}

function cleanMissing(points: string[]): string[] {
  return points
    .map((point) => point.trim())
    .filter((point) => point.length > 0)
    .slice(0, MAX_MISSING_POINTS)
    .map((point) => point.slice(0, MAX_MISSING_POINT_CHARS));
}
