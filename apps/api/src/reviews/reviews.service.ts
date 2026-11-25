import { Injectable, Logger } from "@nestjs/common";
import {
  createInitialSrsState,
  previewSrsIntervals,
  scheduleSrsReview,
  type SrsCardState,
  type SrsRating,
} from "@margem/srs";
import type { EnqueueStudyErrorsInput, ReviewCardDto } from "@margem/shared";
import { PolicyService } from "../policies/policy.service";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class ReviewsService {
  private readonly logger = new Logger(ReviewsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly policyService: PolicyService,
  ) {}

  async listDue(userId: string): Promise<ReviewCardDto[]> {
    const now = new Date();
    const items = await this.prisma.reviewItem.findMany({
      where: {
        userId,
        archivedAt: null,
        deletedAt: null,
        due: { lte: now },
      },
      orderBy: { due: "asc" },
      take: 50,
    });

    const questionIds = items.filter((item) => item.kind === "question").map((item) => item.refId);
    const questions =
      questionIds.length > 0
        ? await this.prisma.question.findMany({
            where: {
              id: { in: questionIds },
              deletedAt: null,
              status: "approved",
              note: { deletedAt: null },
            },
            include: {
              anchor: true,
              note: {
                select: {
                  id: true,
                  notebookId: true,
                  notebook: { select: { name: true } },
                },
              },
            },
          })
        : [];

    const questionMap = new Map(questions.map((q) => [q.id, q]));
    const cards: ReviewCardDto[] = [];

    for (const item of items) {
      if (item.kind !== "question") continue;
      const question = questionMap.get(item.refId);
      if (!question) continue;

      const srsState = this.toSrsState(item);
      cards.push({
        id: item.id,
        kind: item.kind,
        refId: item.refId,
        noteId: question.noteId,
        notebookId: question.note.notebookId,
        notebookName: question.note.notebook.name,
        prompt: question.text,
        answer: question.answer,
        quote: question.anchor && !question.anchor.deletedAt ? question.anchor.quote : null,
        due: item.due.toISOString(),
        intervals: previewSrsIntervals(srsState, now),
      });
    }

    return cards;
  }

  async submitReview(
    userId: string,
    reviewItemId: string,
    rating: SrsRating,
  ): Promise<{ ok: true; nextDue: string; scheduledDays: number }> {
    const item = await this.prisma.reviewItem.findUnique({
      where: { id: reviewItemId },
    });
    const isActive = item && !item.deletedAt && !item.archivedAt;
    this.policyService.assertOwner(userId, isActive ? item.userId : null);

    const now = new Date();
    const currentState = this.toSrsState(item!);
    const { nextState, scheduledDays } = scheduleSrsReview(currentState, rating, now);

    await this.prisma.$transaction(async (tx) => {
      await tx.reviewLog.create({
        data: {
          reviewItemId,
          rating,
          reviewedAt: now,
          previousState: {
            due: currentState.due.toISOString(),
            stability: currentState.stability,
            difficulty: currentState.difficulty,
            scheduledDays: currentState.scheduledDays,
            reps: currentState.reps,
            lapses: currentState.lapses,
            state: currentState.state,
          },
        },
      });

      await tx.reviewItem.update({
        where: { id: reviewItemId },
        data: {
          due: nextState.due,
          stability: nextState.stability,
          difficulty: nextState.difficulty,
          scheduledDays: nextState.scheduledDays,
          learningSteps: nextState.learningSteps,
          reps: nextState.reps,
          lapses: nextState.lapses,
          state: nextState.state,
          lastReview: nextState.lastReview,
        },
      });

      await tx.auditLog.create({
        data: {
          userId,
          action: "review.submitted",
          metadata: { reviewItemId, rating },
        },
      });
    });

    this.logger.log({ reviewItemId, userId, rating, scheduledDays }, "Review submitted");

    return {
      ok: true,
      nextDue: nextState.due.toISOString(),
      scheduledDays,
    };
  }

  async enqueueStudyErrors(
    userId: string,
    input: EnqueueStudyErrorsInput,
  ): Promise<{ enqueued: number }> {
    const note = await this.prisma.note.findUnique({
      where: { id: input.noteId },
      select: { id: true, authorId: true, deletedAt: true },
    });
    this.policyService.assertOwner(userId, note?.deletedAt ? null : note?.authorId);

    const validQuestions = await this.prisma.question.findMany({
      where: {
        id: { in: input.questionIds },
        noteId: input.noteId,
        deletedAt: null,
      },
      select: { id: true },
    });

    const now = new Date();
    let enqueued = 0;

    await this.prisma.$transaction(async (tx) => {
      for (const question of validQuestions) {
        const existing = await tx.reviewItem.findUnique({
          where: {
            userId_kind_refId: {
              userId,
              kind: "question",
              refId: question.id,
            },
          },
        });

        const baseState = existing ? this.toSrsState(existing) : createInitialSrsState(now);
        const { nextState } = scheduleSrsReview(baseState, "again", now);

        await tx.reviewItem.upsert({
          where: {
            userId_kind_refId: {
              userId,
              kind: "question",
              refId: question.id,
            },
          },
          create: {
            userId,
            kind: "question",
            refId: question.id,
            due: nextState.due,
            stability: nextState.stability,
            difficulty: nextState.difficulty,
            scheduledDays: nextState.scheduledDays,
            learningSteps: nextState.learningSteps,
            reps: nextState.reps,
            lapses: nextState.lapses,
            state: nextState.state,
            lastReview: nextState.lastReview,
          },
          update: {
            archivedAt: null,
            deletedAt: null,
            due: nextState.due,
            stability: nextState.stability,
            difficulty: nextState.difficulty,
            scheduledDays: nextState.scheduledDays,
            learningSteps: nextState.learningSteps,
            reps: nextState.reps,
            lapses: nextState.lapses,
            state: nextState.state,
            lastReview: nextState.lastReview,
          },
        });
        enqueued++;
      }

      await tx.auditLog.create({
        data: {
          userId,
          action: "review.study_errors_enqueued",
          metadata: { noteId: input.noteId, count: enqueued },
        },
      });
    });

    this.logger.log({ noteId: input.noteId, userId, count: enqueued }, "Study errors enqueued");

    return { enqueued };
  }

  private toSrsState(item: {
    due: Date;
    stability: number;
    difficulty: number;
    scheduledDays: number;
    learningSteps: number;
    reps: number;
    lapses: number;
    state: number;
    lastReview: Date | null;
  }): SrsCardState {
    return {
      due: item.due,
      stability: item.stability,
      difficulty: item.difficulty,
      scheduledDays: item.scheduledDays,
      learningSteps: item.learningSteps,
      reps: item.reps,
      lapses: item.lapses,
      state: item.state,
      lastReview: item.lastReview,
    };
  }
}
