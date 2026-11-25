import { Injectable, Logger, NotFoundException } from "@nestjs/common";
import type { CreateTextSourceInput, SourceDto } from "@margem/shared";
import { PolicyService } from "../policies/policy.service";
import { PrismaService } from "../prisma/prisma.service";
import { assertWithinQuota } from "../quotas/quota";
import { chunkText } from "./chunk-text";

@Injectable()
export class SourcesService {
  private readonly logger = new Logger(SourcesService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly policyService: PolicyService,
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
        data: {
          userId,
          action: "source.created",
          metadata: { sourceId: source.id, notebookId: source.notebookId, type: source.type },
        },
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

  private toDto(source: {
    id: string;
    notebookId: string;
    type: SourceDto["type"];
    title: string;
    content: string | null;
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
      status: source.status,
      createdAt: source.createdAt.toISOString(),
      updatedAt: source.updatedAt.toISOString(),
    };
  }
}
