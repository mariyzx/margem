import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import type { CreateNoteInput, NoteDto, UpdateNoteInput } from "@margem/shared";
import { PolicyService } from "../policies/policy.service";
import { PrismaService } from "../prisma/prisma.service";

const EMPTY_TIPTAP_DOC: Prisma.InputJsonValue = {
  type: "doc",
  content: [{ type: "paragraph" }],
};

@Injectable()
export class NotesService {
  private readonly logger = new Logger(NotesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly policyService: PolicyService,
  ) {}

  async getById(userId: string, noteId: string): Promise<NoteDto> {
    const note = await this.prisma.note.findUnique({
      where: { id: noteId },
    });
    this.policyService.assertOwner(userId, note?.deletedAt ? null : note?.authorId);
    if (!note || note.deletedAt) {
      throw new NotFoundException("Resource not found");
    }

    return this.toDto(note);
  }

  async create(userId: string, input: CreateNoteInput): Promise<NoteDto> {
    const notebook = await this.prisma.notebook.findUnique({
      where: { id: input.notebookId },
      select: { id: true, ownerId: true, deletedAt: true },
    });
    this.policyService.assertOwner(userId, notebook?.deletedAt ? null : notebook?.ownerId);

    if (input.sourceId) {
      const source = await this.prisma.source.findUnique({
        where: { id: input.sourceId },
        select: { id: true, notebookId: true, deletedAt: true },
      });
      if (!source || source.deletedAt || source.notebookId !== input.notebookId) {
        throw new NotFoundException("Resource not found");
      }
    }

    const note = await this.prisma.$transaction(async (tx) => {
      const created = await tx.note.create({
        data: {
          notebookId: input.notebookId,
          authorId: userId,
          title: input.title ?? "",
          doc: (input.doc as Prisma.InputJsonValue | undefined) ?? EMPTY_TIPTAP_DOC,
          sourceId: input.sourceId ?? null,
        },
      });
      await tx.auditLog.create({
        data: {
          userId,
          action: "note.created",
          metadata: { noteId: created.id, notebookId: created.notebookId },
        },
      });
      return created;
    });

    this.logger.log({ noteId: note.id, notebookId: note.notebookId, userId }, "Note created");

    return this.toDto(note);
  }

  async update(userId: string, noteId: string, input: UpdateNoteInput): Promise<NoteDto> {
    const existing = await this.prisma.note.findUnique({
      where: { id: noteId },
      select: { id: true, authorId: true, deletedAt: true, materialOpenedAt: true },
    });
    this.policyService.assertOwner(userId, existing?.deletedAt ? null : existing?.authorId);

    const updated = await this.prisma.$transaction(async (tx) => {
      const saved = await tx.note.update({
        where: { id: noteId },
        data: {
          ...(input.title !== undefined ? { title: input.title } : {}),
          ...(input.doc !== undefined ? { doc: input.doc as Prisma.InputJsonValue } : {}),
          ...(input.materialOpenedAt !== undefined && !existing?.materialOpenedAt
            ? { materialOpenedAt: new Date(input.materialOpenedAt) }
            : {}),
        },
      });
      await tx.auditLog.create({
        data: {
          userId,
          action: "note.updated",
          metadata: { noteId: saved.id },
        },
      });
      return saved;
    });

    this.logger.log({ noteId: updated.id, userId }, "Note updated");

    return this.toDto(updated);
  }

  async remove(userId: string, noteId: string): Promise<{ ok: true }> {
    const existing = await this.prisma.note.findUnique({
      where: { id: noteId },
      select: { id: true, authorId: true, deletedAt: true },
    });
    this.policyService.assertOwner(userId, existing?.deletedAt ? null : existing?.authorId);

    await this.prisma.$transaction(async (tx) => {
      await tx.note.update({
        where: { id: noteId },
        data: { deletedAt: new Date() },
      });
      await tx.auditLog.create({
        data: {
          userId,
          action: "note.deleted",
          metadata: { noteId },
        },
      });
    });

    this.logger.log({ noteId, userId }, "Note soft-deleted");

    return { ok: true };
  }

  private toDto(note: {
    id: string;
    notebookId: string;
    authorId: string;
    title: string;
    doc: Prisma.JsonValue;
    materialOpenedAt: Date | null;
    sourceId: string | null;
    createdAt: Date;
    updatedAt: Date;
  }): NoteDto {
    return {
      id: note.id,
      notebookId: note.notebookId,
      authorId: note.authorId,
      title: note.title,
      doc: (note.doc ?? { type: "doc", content: [] }) as Record<string, unknown>,
      materialOpenedAt: note.materialOpenedAt ? note.materialOpenedAt.toISOString() : null,
      sourceId: note.sourceId,
      createdAt: note.createdAt.toISOString(),
      updatedAt: note.updatedAt.toISOString(),
    };
  }
}
