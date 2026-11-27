import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
  Optional,
  ServiceUnavailableException,
} from "@nestjs/common";
import {
  type CreateLinkSourceInput,
  extractMemoryParagraphs,
  type CreateTextSourceInput,
  MAX_READ_CHUNKS,
  type MemoryGapDto,
  type SourceChunksDto,
  type SourceDto,
} from "@margem/shared";
import type { Source } from "@prisma/client";
import { PolicyService } from "../policies/policy.service";
import { PrismaService } from "../prisma/prisma.service";
import { assertWithinQuota, assertWithinStorageQuota } from "../quotas/quota";
import { chunkText } from "./chunk-text";
import { randomUUID } from "node:crypto";
import { withAuditContext } from "../security/request-context";
import { isPdfBuffer, MAX_PDF_BYTES } from "./pdf-validation";
import { SourceIngestQueue } from "./source-ingest.queue";
import { resolveAndValidateUrl, SsrfBlockedError } from "./ssrf-guard";
import { StorageService } from "./storage.service";
import { EmbeddingsService } from "../search/embeddings.service";
import { findMemoryGaps } from "./memory-gaps";

@Injectable()
export class SourcesService {
  private readonly logger = new Logger(SourcesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly policyService: PolicyService,
    @Optional() private readonly ingestQueue?: SourceIngestQueue,
    @Optional() private readonly storage?: StorageService,
    @Optional() private readonly embeddings?: EmbeddingsService,
  ) {}

  async createText(userId: string, input: CreateTextSourceInput): Promise<SourceDto> {
    const notebook = await this.prisma.notebook.findUnique({
      where: { id: input.notebookId },
      select: { id: true, ownerId: true, deletedAt: true },
    });
    this.policyService.assertOwner(userId, notebook?.deletedAt ? null : notebook?.ownerId);

    const owned = await this.prisma.source.count({
      where: { deletedAt: null, notebook: { ownerId: userId, deletedAt: null } },
    });
    assertWithinQuota("sources", owned);

    const created = await this.prisma.$transaction(async (tx) => {
      const source = await tx.source.create({
        data: {
          notebookId: input.notebookId,
          type: "text",
          title: input.title,
          content: input.content,
          status: "ready",
        },
      });

      const chunks = chunkText(input.content);
      if (chunks.length > 0) {
        await tx.sourceChunk.createMany({
          data: chunks.map((text, ord) => ({
            sourceId: source.id,
            ord,
            text,
          })),
        });
      }

      await tx.auditLog.create({
        data: withAuditContext({
          userId,
          action: "source.created",
          metadata: { sourceId: source.id, notebookId: source.notebookId, type: source.type },
        }),
      });
      return source;
    });

    this.logger.log(
      { sourceId: created.id, notebookId: created.notebookId, userId },
      "Source created",
    );

    return this.toDto(created);
  }

  async getById(userId: string, sourceId: string): Promise<SourceDto> {
    const source = await this.prisma.source.findUnique({
      where: { id: sourceId },
      include: { notebook: { select: { ownerId: true, deletedAt: true } } },
    });
    const isActive = source && !source.deletedAt && !source.notebook.deletedAt;
    this.policyService.assertOwner(userId, isActive ? source.notebook.ownerId : null);
    if (!source || !isActive) {
      throw new NotFoundException("Resource not found");
    }

    return this.toDto(source);
  }

  async listChunks(userId: string, sourceId: string): Promise<SourceChunksDto> {
    await this.getById(userId, sourceId);
    const rows = await this.prisma.sourceChunk.findMany({
      where: { sourceId },
      orderBy: { ord: "asc" },
      take: MAX_READ_CHUNKS + 1,
      select: { id: true, ord: true, page: true, text: true },
    });
    return { chunks: rows.slice(0, MAX_READ_CHUNKS), truncated: rows.length > MAX_READ_CHUNKS };
  }

  private toDto(source: {
    id: string;
    notebookId: string;
    type: SourceDto["type"];
    title: string;
    content: string | null;
    url?: string | null;
    status: SourceDto["status"];
    createdAt: Date;
    updatedAt: Date;
  }): SourceDto {
    return {
      id: source.id,
      notebookId: source.notebookId,
      type: source.type,
      title: source.title,
      content: source.content,
      url: source.url ?? null,
      status: source.status,
      createdAt: source.createdAt.toISOString(),
      updatedAt: source.updatedAt.toISOString(),
    };
  }

  async createLink(userId: string, input: CreateLinkSourceInput): Promise<SourceDto> {
    const notebook = await this.prisma.notebook.findUnique({
      where: { id: input.notebookId },
      select: { id: true, ownerId: true, deletedAt: true },
    });
    this.policyService.assertOwner(userId, notebook?.deletedAt ? null : notebook?.ownerId);

    const owned = await this.prisma.source.count({
      where: { deletedAt: null, notebook: { ownerId: userId, deletedAt: null } },
    });
    assertWithinQuota("sources", owned);

    let validatedUrl: URL;
    try {
      const resolved = await resolveAndValidateUrl(input.url);
      validatedUrl = resolved.url;
    } catch (error) {
      if (error instanceof SsrfBlockedError) {
        throw new BadRequestException(error.message);
      }
      throw new BadRequestException("Could not resolve link host");
    }

    if (!this.ingestQueue) {
      throw new ServiceUnavailableException("Link ingestion is not available");
    }

    const safeTitle = input.title?.trim().slice(0, 120) || validatedUrl.hostname;

    const created = await this.prisma.$transaction(async (tx) => {
      const source = await tx.source.create({
        data: {
          notebookId: input.notebookId,
          type: "link",
          title: safeTitle,
          url: validatedUrl.toString(),
          status: "queued",
        },
      });
      await tx.auditLog.create({
        data: withAuditContext({
          userId,
          action: "source.created",
          metadata: { sourceId: source.id, notebookId: source.notebookId, type: source.type },
        }),
      });
      return source;
    });

    await this.ingestQueue.enqueue(created.id);

    this.logger.log(
      { sourceId: created.id, notebookId: created.notebookId, userId },
      "Link source queued",
    );

    return this.toDto(created);
  }

  async createFile(
    userId: string,
    input: { notebookId: string; title: string; buffer: Buffer },
  ): Promise<SourceDto> {
    const notebook = await this.prisma.notebook.findUnique({
      where: { id: input.notebookId },
      select: { id: true, ownerId: true, deletedAt: true },
    });
    this.policyService.assertOwner(userId, notebook?.deletedAt ? null : notebook?.ownerId);

    const owned = await this.prisma.source.count({
      where: { deletedAt: null, notebook: { ownerId: userId, deletedAt: null } },
    });
    assertWithinQuota("sources", owned);

    if (
      input.buffer.length === 0 ||
      input.buffer.length > MAX_PDF_BYTES ||
      !isPdfBuffer(input.buffer)
    ) {
      throw new BadRequestException("Invalid PDF file");
    }

    if (!this.storage || !this.ingestQueue) {
      throw new ServiceUnavailableException("PDF upload is not available");
    }

    // Soft-deleted sources still hold their object in the bucket, so they count too.
    const used = await this.prisma.source.aggregate({
      where: { type: "file", notebook: { ownerId: userId } },
      _sum: { sizeBytes: true },
    });
    assertWithinStorageQuota(used._sum.sizeBytes ?? 0, input.buffer.length);

    const storageKey = `sources/${input.notebookId}/${randomUUID()}.pdf`;
    await this.storage.putObject(storageKey, input.buffer, "application/pdf");

    const safeTitle = input.title.trim().slice(0, 200) || "Documento.pdf";

    let created: Source;
    try {
      created = await this.prisma.$transaction(async (tx) => {
        const source = await tx.source.create({
          data: {
            notebookId: input.notebookId,
            type: "file",
            title: safeTitle,
            storageKey,
            sizeBytes: input.buffer.length,
            status: "queued",
          },
        });
        await tx.auditLog.create({
          data: withAuditContext({
            userId,
            action: "source.created",
            metadata: { sourceId: source.id, notebookId: source.notebookId, type: source.type },
          }),
        });
        return source;
      });
    } catch (error) {
      // No row points at the object: remove it so it does not eat bucket space forever.
      await this.storage.deleteObject(storageKey).catch((cleanupError: unknown) => {
        this.logger.warn(
          { storageKey, err: cleanupError },
          "Failed to remove orphan object after source insert failed",
        );
      });
      throw error;
    }

    await this.ingestQueue.enqueue(created.id);

    this.logger.log(
      { sourceId: created.id, notebookId: created.notebookId, userId },
      "PDF source uploaded",
    );

    return this.toDto(created);
  }

  async getSignedFileUrl(userId: string, sourceId: string): Promise<string> {
    const source = await this.prisma.source.findUnique({
      where: { id: sourceId },
      include: { notebook: { select: { ownerId: true, deletedAt: true } } },
    });
    const isActive = source && !source.deletedAt && !source.notebook.deletedAt;
    this.policyService.assertOwner(userId, isActive ? source.notebook.ownerId : null);
    if (!source || !isActive || source.type !== "file" || !source.storageKey) {
      throw new NotFoundException("Resource not found");
    }
    if (!this.storage) {
      throw new ServiceUnavailableException("Object storage is not available");
    }

    return this.storage.getSignedDownloadUrl(source.storageKey, source.title);
  }

  async remove(userId: string, sourceId: string): Promise<{ ok: true }> {
    const source = await this.prisma.source.findUnique({
      where: { id: sourceId },
      include: { notebook: { select: { ownerId: true, deletedAt: true } } },
    });
    const isOwnedNotebook = source && !source.notebook.deletedAt;
    this.policyService.assertOwner(userId, isOwnedNotebook ? source.notebook.ownerId : null);
    if (!source || source.notebook.deletedAt) {
      throw new NotFoundException("Resource not found");
    }

    await this.prisma.$transaction(async (tx) => {
      if (!source.deletedAt) {
        await tx.source.update({
          where: { id: sourceId },
          data: { deletedAt: new Date() },
        });
      }
      await tx.note.updateMany({
        where: { sourceId, deletedAt: null },
        data: { sourceId: null },
      });
      await tx.auditLog.create({
        data: withAuditContext({
          userId,
          action: "source.deleted",
          metadata: { sourceId },
        }),
      });
    });

    if (source.type === "file" && source.storageKey && this.storage) {
      await this.storage.deleteObject(source.storageKey).catch((err) => {
        this.logger.warn(
          { sourceId, error: err instanceof Error ? err.message : String(err) },
          "Failed to delete source object from storage",
        );
      });
    }

    this.logger.log({ sourceId, userId }, "Source soft-deleted");
    return { ok: true };
  }

  async getMemoryGaps(
    userId: string,
    noteId: string,
  ): Promise<{ gaps: MemoryGapDto[]; hasMemoryText: boolean }> {
    const note = await this.prisma.note.findUnique({
      where: { id: noteId },
      select: {
        id: true,
        authorId: true,
        deletedAt: true,
        doc: true,
        sourceId: true,
        source: { select: { id: true, deletedAt: true, status: true } },
      },
    });

    this.policyService.assertOwner(userId, note?.deletedAt ? null : note?.authorId);
    if (
      !note ||
      !note.sourceId ||
      !note.source ||
      note.source.deletedAt ||
      note.source.status !== "ready"
    ) {
      return { gaps: [], hasMemoryText: false };
    }

    const memoryParagraphs = extractMemoryParagraphs(note.doc);
    if (memoryParagraphs.length === 0) {
      return { gaps: [], hasMemoryText: false };
    }

    const chunks = await this.prisma.sourceChunk.findMany({
      where: { sourceId: note.sourceId },
      orderBy: { ord: "asc" },
      take: 40,
      select: { id: true, ord: true, page: true, text: true },
    });

    if (chunks.length === 0) {
      return { gaps: [], hasMemoryText: true };
    }

    let memoryVectors: number[][] | null = null;
    let chunkVectors: number[][] | null = null;
    if (this.embeddings) {
      const allTexts = [...memoryParagraphs, ...chunks.map((c) => c.text)];
      const allVectors = await this.embeddings.embed(allTexts);
      if (allVectors && allVectors.length === allTexts.length) {
        memoryVectors = allVectors.slice(0, memoryParagraphs.length);
        chunkVectors = allVectors.slice(memoryParagraphs.length);
      }
    }

    const gaps = findMemoryGaps({
      memoryParagraphs,
      chunks,
      memoryVectors,
      chunkVectors,
    });

    return { gaps, hasMemoryText: true };
  }
}
