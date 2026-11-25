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
      where: { ownerId: userId },
      orderBy: { updatedAt: "desc" },
      include: {
        notes: {
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

    return notebooks.map((nb) => ({
      id: nb.id,
      name: nb.name,
      color: nb.color,
      createdAt: nb.createdAt.toISOString(),
      updatedAt: nb.updatedAt.toISOString(),
      notes: nb.notes.map((note) => ({
        id: note.id,
        notebookId: note.notebookId,
        title: note.title,
        createdAt: note.createdAt.toISOString(),
        updatedAt: note.updatedAt.toISOString(),
      })),
    }));
  }

  async create(userId: string, input: CreateNotebookInput): Promise<NotebookDto> {
    const notebook = await this.prisma.notebook.create({
      data: {
        ownerId: userId,
        name: input.name,
        color: input.color,
      },
    });

    this.logger.log({ notebookId: notebook.id, userId }, "Notebook created");

    return {
      id: notebook.id,
      name: notebook.name,
      color: notebook.color,
      createdAt: notebook.createdAt.toISOString(),
      updatedAt: notebook.updatedAt.toISOString(),
      notes: [],
    };
  }

  async update(
    userId: string,
    notebookId: string,
    input: UpdateNotebookInput,
  ): Promise<NotebookDto> {
    const existing = await this.prisma.notebook.findUnique({
      where: { id: notebookId },
      select: { id: true, ownerId: true },
    });
    this.policyService.assertOwner(userId, existing?.ownerId);

    const updated = await this.prisma.notebook.update({
      where: { id: notebookId },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.color !== undefined ? { color: input.color } : {}),
      },
    });

    this.logger.log({ notebookId: updated.id, userId }, "Notebook updated");

    return {
      id: updated.id,
      name: updated.name,
      color: updated.color,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
    };
  }

  async remove(userId: string, notebookId: string): Promise<{ ok: true }> {
    const existing = await this.prisma.notebook.findUnique({
      where: { id: notebookId },
      select: { id: true, ownerId: true },
    });
    this.policyService.assertOwner(userId, existing?.ownerId);

    await this.prisma.notebook.delete({ where: { id: notebookId } });
    this.logger.log({ notebookId, userId }, "Notebook deleted");

    return { ok: true };
  }
}
