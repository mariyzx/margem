import { Injectable, Logger } from "@nestjs/common";
import type { CreateNotebookInput, NotebookDto, UpdateNotebookInput } from "@margem/shared";
import { PolicyService } from "../policies/policy.service";
import { PrismaService } from "../prisma/prisma.service";

@Injectable()
export class NotebooksService {
  private readonly logger = new Logger(NotebooksService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly policyService: PolicyService,
  ) {}

  async listForUser(userId: string): Promise<NotebookDto[]> {
    const notebooks = await this.prisma.notebook.findMany({
      where: { ownerId: userId, deletedAt: null },
      orderBy: { updatedAt: "desc" },
      include: {
        notes: {
          where: { deletedAt: null },
          orderBy: { updatedAt: "desc" },
          select: {
            id: true,
            notebookId: true,
            title: true,
            createdAt: true,
            updatedAt: true,
          },
        },
      },
    });

    return notebooks.map((nb) => this.toDto(nb));
  }

  async create(userId: string, input: CreateNotebookInput): Promise<NotebookDto> {
    const notebook = await this.prisma.$transaction(async (tx) => {
      const created = await tx.notebook.create({
        data: {
          ownerId: userId,
          name: input.name,
          color: input.color,
        },
      });
      await tx.auditLog.create({
        data: {
          userId,
          action: "notebook.created",
          metadata: { notebookId: created.id, color: created.color },
        },
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
        data: {
          userId,
          action: "notebook.updated",
          metadata: { notebookId: saved.id },
        },
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
  }): NotebookDto {
    return {
      id: notebook.id,
      name: notebook.name,
      color: notebook.color,
      createdAt: notebook.createdAt.toISOString(),
      updatedAt: notebook.updatedAt.toISOString(),
      ...(notebook.notes !== undefined
        ? {
            notes: notebook.notes.map((note) => ({
              id: note.id,
              notebookId: note.notebookId,
              title: note.title,
              createdAt: note.createdAt.toISOString(),
              updatedAt: note.updatedAt.toISOString(),
            })),
          }
        : {}),
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
        data: {
          userId,
          action: "notebook.deleted",
          metadata: { notebookId },
        },
      });
    });

    this.logger.log({ notebookId, userId }, "Notebook soft-deleted");

    return { ok: true };
  }
}
