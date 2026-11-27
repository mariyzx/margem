import { ConflictException, Injectable, Logger } from "@nestjs/common";
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
import { withAuditContext } from "../security/request-context";
import { toQuestionDto } from "./question-dto";
import { createReviewItem } from "../reviews/create-review-item";

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

      return toQuestionDto({ ...q, anchor });
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

      await createReviewItem(tx, userId, "question", question.id);

      await tx.auditLog.create({
        data: withAuditContext({
          userId,
          action: "question.created",
          metadata: { questionId: question.id, noteId },
        }),
      });

      return question;
    });

    this.logger.log({ questionId: created.id, noteId, userId }, "Question created");

    return toQuestionDto(created);
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
        data: withAuditContext({
          userId,
          action: "question.updated",
          metadata: { questionId: saved.id, noteId: saved.noteId },
        }),
      });
      return saved;
    });

    this.logger.log({ questionId: updated.id, userId }, "Question updated");

    return toQuestionDto(updated);
  }

  async approve(userId: string, questionId: string): Promise<QuestionDto> {
    const existing = await this.findOwnedActive(userId, questionId);
    if (existing.status === "approved") {
      return toQuestionDto(await this.findWithAnchor(questionId));
    }
    if (existing.status !== "pending") {
      throw new ConflictException("Question is not pending");
    }

    const approved = await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.question.updateMany({
        where: { id: questionId, status: "pending", deletedAt: null },
        data: { status: "approved" },
      });
      const saved = await tx.question.findUniqueOrThrow({
        where: { id: questionId },
        include: { anchor: true },
      });
      if (count === 0) return saved;
      await createReviewItem(tx, userId, "question", questionId);
      await tx.auditLog.create({
        data: withAuditContext({
          userId,
          action: "question.approved",
          metadata: { questionId, noteId: saved.noteId },
        }),
      });
      return saved;
    });

    this.logger.log({ questionId, userId }, "Question approved");
    return toQuestionDto(approved);
  }

  async discard(userId: string, questionId: string): Promise<{ ok: true }> {
    const existing = await this.findOwnedActive(userId, questionId);
    if (existing.status !== "pending") {
      throw new ConflictException("Question is not pending");
    }

    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.question.update({
        where: { id: questionId },
        data: { status: "discarded", deletedAt: now },
      });
      if (existing.anchorId) {
        await tx.anchor.update({ where: { id: existing.anchorId }, data: { deletedAt: now } });
      }
      await tx.auditLog.create({
        data: withAuditContext({
          userId,
          action: "question.discarded",
          metadata: { questionId, noteId: existing.noteId },
        }),
      });
    });

    this.logger.log({ questionId, userId }, "Question discarded");
    return { ok: true };
  }

  private async findOwnedActive(userId: string, questionId: string) {
    const existing = await this.prisma.question.findUnique({
      where: { id: questionId },
      select: {
        id: true,
        noteId: true,
        anchorId: true,
        status: true,
        deletedAt: true,
        note: { select: { authorId: true, deletedAt: true } },
      },
    });
    const isActive = existing && !existing.deletedAt && !existing.note.deletedAt;
    this.policyService.assertOwner(userId, isActive ? existing.note.authorId : null);
    return existing!;
  }

  private async findWithAnchor(questionId: string) {
    return this.prisma.question.findUniqueOrThrow({
      where: { id: questionId },
      include: { anchor: true },
    });
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
        data: withAuditContext({
          userId,
          action: "question.deleted",
          metadata: { questionId, noteId: existing?.noteId },
        }),
      });
    });

    this.logger.log({ questionId, userId }, "Question soft-deleted");

    return { ok: true };
  }
}
