import { ConflictException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import type { GeneratePracticeInput, PracticeItemDto, PracticeKind } from "@margem/shared";
import { practiceKindSchema } from "@margem/shared";
import { AiService } from "../ai/ai.service";
import {
  buildGeneratePracticePrompt,
  generatePracticeOutputSchema,
  MAX_SOURCE_CHARS_FOR_PRACTICE,
} from "../ai/prompts/generate-practice";
import { PrismaService } from "../prisma/prisma.service";
import { assertWithinQuota, quotaLimit } from "../quotas/quota";
import { createReviewItem } from "../reviews/create-review-item";
import { withAuditContext } from "../security/request-context";
import { groundPractice } from "./ground-practice";
import { toPracticeDto } from "./practice-dto";
import { takeWithinBudget } from "../ai/prompt";

const MAX_CHUNKS = 40;
const ALL_KINDS: PracticeKind[] = practiceKindSchema.options;

@Injectable()
export class PracticeService {
  private readonly logger = new Logger(PracticeService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly ai: AiService,
  ) {}

  async generate(
    userId: string,
    sourceId: string,
    input: GeneratePracticeInput,
  ): Promise<{ items: PracticeItemDto[] }> {
    const source = await this.findOwnedSource(userId, sourceId);
    if (source.status !== "ready") {
      return { items: [] };
    }

    const owned = await this.countOwned(userId);
    assertWithinQuota("practice", owned);

    const chunks = await this.prisma.sourceChunk.findMany({
      where: { sourceId },
      orderBy: { ord: "asc" },
      take: MAX_CHUNKS,
      select: { id: true, text: true },
    });
    const texts = takeWithinBudget(
      chunks.map((chunk) => chunk.text),
      MAX_SOURCE_CHARS_FOR_PRACTICE,
    );
    if (texts.length === 0) {
      return { items: [] };
    }

    const kinds = input.kinds ?? ALL_KINDS;
    const excerpts = texts.map((text, index) => ({ id: `c${index + 1}`, text }));
    const byPromptId = new Map(
      excerpts.map((excerpt, index) => [
        excerpt.id,
        { chunkId: chunks[index]!.id, text: excerpt.text },
      ]),
    );

    const { data, provider } = await this.ai.completeJson(
      userId,
      "generate-practice",
      buildGeneratePracticePrompt(excerpts, kinds),
      generatePracticeOutputSchema,
    );
    const grounded = groundPractice(data, byPromptId, kinds).slice(
      0,
      quotaLimit("practice") - owned,
    );

    const created = await this.prisma.$transaction(async (tx) => {
      const replaced = await tx.practiceItem.updateMany({
        where: { sourceId, createdBy: "ai", status: "pending", deletedAt: null },
        data: { status: "discarded", deletedAt: new Date() },
      });
      const saved = [];
      for (const item of grounded) {
        saved.push(
          await tx.practiceItem.create({
            data: {
              notebookId: source.notebookId,
              sourceId,
              sourceChunkId: item.sourceChunkId,
              kind: item.kind,
              prompt: item.prompt,
              answer: item.answer,
              createdBy: "ai",
              status: "pending",
            },
          }),
        );
      }
      await tx.auditLog.create({
        data: withAuditContext({
          userId,
          action: "practice.generated",
          metadata: { sourceId, provider, items: saved.length, replaced: replaced.count },
        }),
      });
      return saved;
    });

    this.logger.log(
      { sourceId, provider, items: created.length, dropped: data.items.length - created.length },
      "ai.practice_generated",
    );
    return { items: created.map(toPracticeDto) };
  }

  async listForSource(userId: string, sourceId: string): Promise<{ items: PracticeItemDto[] }> {
    await this.findOwnedSource(userId, sourceId);
    const items = await this.prisma.practiceItem.findMany({
      where: { sourceId, deletedAt: null, status: { in: ["pending", "approved"] } },
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
    });
    return { items: items.map(toPracticeDto) };
  }

  async approve(userId: string, practiceId: string): Promise<PracticeItemDto> {
    const existing = await this.findOwnedItem(userId, practiceId);
    if (existing.status === "discarded") {
      throw new ConflictException("Practice item is not pending");
    }

    const approved = await this.prisma.$transaction(async (tx) => {
      const { count } = await tx.practiceItem.updateMany({
        where: { id: practiceId, status: "pending", deletedAt: null },
        data: { status: "approved" },
      });
      const saved = await tx.practiceItem.findUniqueOrThrow({ where: { id: practiceId } });
      if (count === 0) return saved;
      await createReviewItem(tx, userId, "practice", practiceId);
      await tx.auditLog.create({
        data: withAuditContext({
          userId,
          action: "practice.approved",
          metadata: { practiceId, sourceId: saved.sourceId },
        }),
      });
      return saved;
    });
    return toPracticeDto(approved);
  }

  async discard(userId: string, practiceId: string): Promise<{ ok: true }> {
    const existing = await this.findOwnedItem(userId, practiceId);
    if (existing.status !== "pending") {
      throw new ConflictException("Practice item is not pending");
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.practiceItem.update({
        where: { id: practiceId },
        data: { status: "discarded", deletedAt: new Date() },
      });
      await tx.auditLog.create({
        data: withAuditContext({
          userId,
          action: "practice.discarded",
          metadata: { practiceId, sourceId: existing.sourceId },
        }),
      });
    });
    return { ok: true };
  }

  private async findOwnedSource(userId: string, sourceId: string) {
    const source = await this.prisma.source.findFirst({
      where: {
        id: sourceId,
        deletedAt: null,
        notebook: { ownerId: userId, deletedAt: null },
      },
      select: { id: true, notebookId: true, status: true },
    });
    if (!source) throw new NotFoundException("Resource not found");
    return source;
  }

  private async findOwnedItem(userId: string, practiceId: string) {
    const item = await this.prisma.practiceItem.findFirst({
      where: {
        id: practiceId,
        deletedAt: null,
        notebook: { ownerId: userId, deletedAt: null },
        source: { deletedAt: null },
      },
      select: { id: true, status: true, sourceId: true },
    });
    if (!item) throw new NotFoundException("Resource not found");
    return item;
  }

  private countOwned(userId: string) {
    return this.prisma.practiceItem.count({
      where: { deletedAt: null, notebook: { ownerId: userId, deletedAt: null } },
    });
  }
}
