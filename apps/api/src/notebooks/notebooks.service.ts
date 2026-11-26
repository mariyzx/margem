import { Injectable, Logger } from "@nestjs/common";
import {
  NOTEBOOK_NOTES_PREVIEW_LIMIT,
  type CreateNotebookInput,
  type NotebookDto,
  type NoteSummary,
  type PaginationQuery,
  type UpdateNotebookInput,
} from "@margem/shared";
import { cursorArgs, toPage } from "../common/pagination";
import { PolicyService } from "../policies/policy.service";
import { PrismaService } from "../prisma/prisma.service";
import { assertWithinQuota } from "../quotas/quota";
import { withAuditContext } from "../security/request-context";

const NOTE_SUMMARY_SELECT = {
  id: true,
  notebookId: true,
  title: true,
  createdAt: true,
  updatedAt: true,
} as const;

@Injectable()
export class NotebooksService {
  private readonly logger = new Logger(NotebooksService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly policyService: PolicyService,
  ) {}

  async listForUser(
    userId: string,
    page: PaginationQuery,
  ): Promise<{ notebooks: NotebookDto[]; nextCursor: string | null }> {
    const rows = await this.prisma.notebook.findMany({
      where: { ownerId: userId, deletedAt: null },
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      ...cursorArgs(page),
      include: {
        notes: {
          where: { deletedAt: null },
          orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
          take: NOTEBOOK_NOTES_PREVIEW_LIMIT + 1,
          select: NOTE_SUMMARY_SELECT,
        },
      },
    });

    const { items, nextCursor } = toPage(rows, page.limit);
    return {
      notebooks: items.map((nb) =>
        this.toDto({
          ...nb,
          notes: nb.notes.slice(0, NOTEBOOK_NOTES_PREVIEW_LIMIT),
          hasMoreNotes: nb.notes.length > NOTEBOOK_NOTES_PREVIEW_LIMIT,
        }),
      ),
      nextCursor,
    };
  }

  async listNotes(
    userId: string,
    notebookId: string,
    page: PaginationQuery,
  ): Promise<{ notes: NoteSummary[]; nextCursor: string | null }> {
    const notebook = await this.prisma.notebook.findUnique({
      where: { id: notebookId },
      select: { ownerId: true, deletedAt: true },
    });
    this.policyService.assertOwner(userId, notebook?.deletedAt ? null : notebook?.ownerId);

    const rows = await this.prisma.note.findMany({
      where: { notebookId, deletedAt: null },
      orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
      ...cursorArgs(page),
      select: NOTE_SUMMARY_SELECT,
    });

    const { items, nextCursor } = toPage(rows, page.limit);
    return { notes: items.map((note) => this.toNoteSummary(note)), nextCursor };
  }

  async create(userId: string, input: CreateNotebookInput): Promise<NotebookDto> {
    const owned = await this.prisma.notebook.count({
      where: { ownerId: userId, deletedAt: null },
    });
    assertWithinQuota("notebooks", owned);

    const notebook = await this.prisma.$transaction(async (tx) => {
      const created = await tx.notebook.create({
        data: {
          ownerId: userId,
          name: input.name,
          color: input.color,
        },
      });
      await tx.auditLog.create({
        data: withAuditContext({
          userId,
          action: "notebook.created",
          metadata: { notebookId: created.id, color: created.color },
        }),
      });
      return created;
    });

    this.logger.log({ notebookId: notebook.id, userId }, "Notebook created");

    return this.toDto({ ...notebook, notes: [] });
  }

  async update(
    userId: string,
    notebookId: string,
    input: UpdateNotebookInput,
  ): Promise<NotebookDto> {
    const existing = await this.prisma.notebook.findUnique({
      where: { id: notebookId },
      select: { id: true, ownerId: true, deletedAt: true },
    });
    this.policyService.assertOwner(userId, existing?.deletedAt ? null : existing?.ownerId);

    const updated = await this.prisma.$transaction(async (tx) => {
      const saved = await tx.notebook.update({
        where: { id: notebookId },
        data: {
          ...(input.name !== undefined ? { name: input.name } : {}),
          ...(input.color !== undefined ? { color: input.color } : {}),
        },
      });
      await tx.auditLog.create({
        data: withAuditContext({
          userId,
          action: "notebook.updated",
          metadata: { notebookId: saved.id },
        }),
      });
      return saved;
    });

    this.logger.log({ notebookId: updated.id, userId }, "Notebook updated");

    return this.toDto(updated);
  }

  private toDto(notebook: {
    id: string;
    name: string;
    color: NotebookDto["color"];
    createdAt: Date;
    updatedAt: Date;
    notes?: Array<{
      id: string;
      notebookId: string;
      title: string;
      createdAt: Date;
      updatedAt: Date;
    }>;
    hasMoreNotes?: boolean;
  }): NotebookDto {
    return {
      id: notebook.id,
      name: notebook.name,
      color: notebook.color,
      createdAt: notebook.createdAt.toISOString(),
      updatedAt: notebook.updatedAt.toISOString(),
      ...(notebook.notes !== undefined
        ? { notes: notebook.notes.map((note) => this.toNoteSummary(note)) }
        : {}),
      ...(notebook.hasMoreNotes !== undefined ? { hasMoreNotes: notebook.hasMoreNotes } : {}),
    };
  }

  private toNoteSummary(note: {
    id: string;
    notebookId: string;
    title: string;
    createdAt: Date;
    updatedAt: Date;
  }): NoteSummary {
    return {
      id: note.id,
      notebookId: note.notebookId,
      title: note.title,
      createdAt: note.createdAt.toISOString(),
      updatedAt: note.updatedAt.toISOString(),
    };
  }

  async remove(userId: string, notebookId: string): Promise<{ ok: true }> {
    const existing = await this.prisma.notebook.findUnique({
      where: { id: notebookId },
      select: { id: true, ownerId: true, deletedAt: true },
    });
    this.policyService.assertOwner(userId, existing?.deletedAt ? null : existing?.ownerId);

    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      await tx.notebook.update({
        where: { id: notebookId },
        data: { deletedAt: now },
      });
      await tx.note.updateMany({
        where: { notebookId, deletedAt: null },
        data: { deletedAt: now },
      });
      await tx.auditLog.create({
        data: withAuditContext({
          userId,
          action: "notebook.deleted",
          metadata: { notebookId },
        }),
      });
    });

    this.logger.log({ notebookId, userId }, "Notebook soft-deleted");

    return { ok: true };
  }
}
