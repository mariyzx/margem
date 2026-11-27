import { Injectable, Logger } from "@nestjs/common";
import { type AiMemoryGapDto, extractMemoryParagraphs } from "@margem/shared";
import { AiService } from "../ai/ai.service";
import {
  buildMemoryGapsPrompt,
  MAX_AI_MEMORY_GAPS,
  MAX_GAP_POINT_CHARS,
  MAX_MEMORY_CHARS,
  MAX_SOURCE_CHARS,
  memoryGapsOutputSchema,
} from "../ai/prompts/memory-gaps";
import { PolicyService } from "../policies/policy.service";
import { PrismaService } from "../prisma/prisma.service";
import { takeWithinBudget } from "../ai/prompt";

const MAX_CHUNKS = 40;
const EXCERPT_CHARS = 220;

@Injectable()
export class MemoryGapsAiService {
  private readonly logger = new Logger(MemoryGapsAiService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly policyService: PolicyService,
    private readonly ai: AiService,
  ) {}

  async check(
    userId: string,
    noteId: string,
  ): Promise<{ gaps: AiMemoryGapDto[]; hasMemoryText: boolean }> {
    const note = await this.prisma.note.findUnique({
      where: { id: noteId },
      select: {
        authorId: true,
        deletedAt: true,
        doc: true,
        sourceId: true,
        source: { select: { deletedAt: true, status: true } },
      },
    });
    this.policyService.assertOwner(userId, note?.deletedAt ? null : note?.authorId);

    const memory = takeWithinBudget(extractMemoryParagraphs(note!.doc), MAX_MEMORY_CHARS);
    if (memory.length === 0) {
      return { gaps: [], hasMemoryText: false };
    }
    if (
      !note!.sourceId ||
      !note!.source ||
      note!.source.deletedAt ||
      note!.source.status !== "ready"
    ) {
      return { gaps: [], hasMemoryText: true };
    }

    const chunks = await this.prisma.sourceChunk.findMany({
      where: { sourceId: note!.sourceId },
      orderBy: { ord: "asc" },
      take: MAX_CHUNKS,
      select: { id: true, ord: true, page: true, text: true },
    });
    const texts = takeWithinBudget(
      chunks.map((chunk) => chunk.text),
      MAX_SOURCE_CHARS,
    );
    if (texts.length === 0) {
      return { gaps: [], hasMemoryText: true };
    }

    const promptIds = texts.map((_, index) => `c${index + 1}`);
    const chunkByPromptId = new Map(promptIds.map((id, index) => [id, chunks[index]!]));

    const { data, provider } = await this.ai.completeJson(
      userId,
      "memory-gaps",
      buildMemoryGapsPrompt(
        memory,
        texts.map((text, index) => ({ id: promptIds[index]!, text })),
      ),
      memoryGapsOutputSchema,
    );

    const seen = new Set<string>();
    const gaps: AiMemoryGapDto[] = [];
    for (const gap of data.gaps) {
      if (gaps.length >= MAX_AI_MEMORY_GAPS) break;
      const chunk = chunkByPromptId.get(gap.sourceChunkId);
      const point = gap.point.trim().slice(0, MAX_GAP_POINT_CHARS);
      if (!chunk || !point || seen.has(point)) continue;
      seen.add(point);
      gaps.push({
        point,
        chunkId: chunk.id,
        ord: chunk.ord,
        page: chunk.page,
        excerpt: excerptOf(chunk.text),
      });
    }

    this.logger.log({ provider, gaps: gaps.length }, "ai.memory_gaps_checked");
    return { gaps, hasMemoryText: true };
  }
}

function excerptOf(text: string): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length <= EXCERPT_CHARS ? clean : `${clean.slice(0, EXCERPT_CHARS - 1)}…`;
}
