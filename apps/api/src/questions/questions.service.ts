import { Injectable, Logger } from "@nestjs/common";
import {
  resolveAnchorInDoc,
  type CreateQuestionInput,
  type PaginationQuery,
  type QuestionDto,
  type UpdateQuestionInput,
} from "@margem/shared";
import { cursorArgs, toPage } from "../common/pagination";
import { PolicyService } from "../policies/policy.service";
import { PrismaService } from "../prisma/prisma.service";
import { assertWithinQuota } from "../quotas/quota";
import { createInitialSrsState } from "@margem/srs";

@Injectable()
export class QuestionsService {
  private readonly logger = new Logger(QuestionsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly policyService: PolicyService,
  ) {}

  async listForNote(
    userId: string,
    noteId: string,
    page: PaginationQuery,
  ): Promise<{ questions: QuestionDto[]; nextCursor: string | null }> {
    const note = await this.prisma.note.findUnique({
      where: { id: noteId },
      select: { id: true, authorId: true, doc: true, deletedAt: true },
    });
    this.policyService.assertOwner(userId, note?.deletedAt ? null : note?.authorId);

    const rows = await this.prisma.question.findMany({
      where: { noteId, deletedAt: null },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      ...cursorArgs(page),
      include: { anchor: true },
    });
    const { items: questions, nextCursor } = toPage(rows, page.limit);

    const doc = (note?.doc ?? { type: "doc", content: [] }) as Record<string, unknown>;

    const dtos = questions.map((q) => {
      const anchor =
        q.anchor && !q.anchor.deletedAt
          ? {
              ...q.anchor,
              status: resolveAnchorInDoc(doc, q.anchor).found
                ? ("active" as const)
                : ("orphaned" as const),
            }
          : null;

      return this.toDto({ ...q, anchor });
    });
    return { questions: dtos, nextCursor };
  }

  async create(userId: string, noteId: string, input: CreateQuestionInput): Promise<QuestionDto> {
    const note = await this.prisma.note.findUnique({
      where: { id: noteId },
      select: { id: true, authorId: true, deletedAt: true },
    });
    this.policyService.assertOwner(userId, note?.deletedAt ? null : note?.authorId);

    const owned = await this.prisma.question.count({
      where: { authorId: userId, deletedAt: null, note: { deletedAt: null } },
    });
    assertWithinQuota("questions", owned);

    const created = await this.prisma.$transaction(async (tx) => {
      const anchor = input.anchor
        ? await tx.anchor.create({
            data: {
              noteId,
              blockId: input.anchor.blockId,
              quote: input.anchor.quote,
              prefix: input.anchor.prefix,
              suffix: input.anchor.suffix,
              status: "active",
            },
          })
        : null;

      const question = await tx.question.create({
        data: {
          noteId,
          anchorId: anchor?.id ?? null,
          authorType: "self",
          authorId: userId,
          text: input.text,
          answer: input.answer,
          status: "approved",
        },
        include: { anchor: true },
      });

      const tomorrow = new Date(Date.now() + 24 * 60 * 60 * 1000);
      const initialSrs = createInitialSrsState(tomorrow);
      await tx.reviewItem.create({
        data: {
          userId,
          kind: "question",
          refId: question.id,
          due: initialSrs.due,
          stability: initialSrs.stability,
          difficulty: initialSrs.difficulty,
          scheduledDays: initialSrs.scheduledDays,
          learningSteps: initialSrs.learningSteps,
          reps: initialSrs.reps,
          lapses: initialSrs.lapses,
          state: initialSrs.state,
          lastReview: initialSrs.lastReview,
        },
      });

      await tx.auditLog.create({
        data: {
          userId,
          action: "question.created",
          metadata: { questionId: question.id, noteId },
        },
      });

      return question;
    });

    this.logger.log({ questionId: created.id, noteId, userId }, "Question created");

    return this.toDto(created);
  }

  async update(
    userId: string,
    questionId: string,
    input: UpdateQuestionInput,
  ): Promise<QuestionDto> {
    const existing = await this.prisma.question.findUnique({
      where: { id: questionId },
      select: {
        id: true,
        noteId: true,
        deletedAt: true,
        note: { select: { authorId: true, deletedAt: true } },
      },
    });
    const isActive = existing && !existing.deletedAt && !existing.note.deletedAt;
    this.policyService.assertOwner(userId, isActive ? existing.note.authorId : null);

    const updated = await this.prisma.$transaction(async (tx) => {
      const saved = await tx.question.update({
        where: { id: questionId },
        data: {
          ...(input.text !== undefined ? { text: input.text } : {}),
          ...(input.answer !== undefined ? { answer: input.answer } : {}),
        },
        include: { anchor: true },
      });
      await tx.auditLog.create({
        data: {
          userId,
          action: "question.updated",
          metadata: { questionId: saved.id, noteId: saved.noteId },
        },
      });
      return saved;
    });

    this.logger.log({ questionId: updated.id, userId }, "Question updated");

    return this.toDto(updated);
  }

  async remove(userId: string, questionId: string): Promise<{ ok: true }> {
    const existing = await this.prisma.question.findUnique({
      where: { id: questionId },
      select: {
        id: true,
        noteId: true,
        anchorId: true,
        deletedAt: true,
        note: { select: { authorId: true, deletedAt: true } },
      },
    });
    const isActive = existing && !existing.deletedAt && !existing.note.deletedAt;
    this.policyService.assertOwner(userId, isActive ? existing.note.authorId : null);

    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.question.update({
        where: { id: questionId },
        data: { deletedAt: now },
      });
      await tx.reviewItem.updateMany({
        where: { userId, kind: "question", refId: questionId, archivedAt: null },
        data: { archivedAt: now },
      });
      if (existing?.anchorId) {
        await tx.anchor.update({
          where: { id: existing.anchorId },
          data: { deletedAt: now },
        });
      }
      await tx.auditLog.create({
        data: {
          userId,
          action: "question.deleted",
          metadata: { questionId, noteId: existing?.noteId },
        },
      });
    });

    this.logger.log({ questionId, userId }, "Question soft-deleted");

    return { ok: true };
  }

  private toDto(question: {
    id: string;
    noteId: string;
    anchorId: string | null;
    authorType: QuestionDto["authorType"];
    authorId: string | null;
    text: string;
    answer: string;
    status: QuestionDto["status"];
    anchor: {
      id: string;
      noteId: string | null;
      blockId: string;
      quote: string;
      prefix: string;
      suffix: string;
      status: "active" | "orphaned";
    } | null;
    createdAt: Date;
    updatedAt: Date;
  }): QuestionDto {
    return {
      id: question.id,
      noteId: question.noteId,
      anchorId: question.anchorId,
      authorType: question.authorType,
      authorId: question.authorId,
      text: question.text,
      answer: question.answer,
      status: question.status,
      anchor: question.anchor
        ? {
            id: question.anchor.id,
            noteId: question.anchor.noteId,
            blockId: question.anchor.blockId,
            quote: question.anchor.quote,
            prefix: question.anchor.prefix,
            suffix: question.anchor.suffix,
            status: question.anchor.status,
          }
        : null,
      createdAt: question.createdAt.toISOString(),
      updatedAt: question.updatedAt.toISOString(),
    };
  }
}
