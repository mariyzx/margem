import { Injectable, Logger } from "@nestjs/common";
import { extractNoteBlocks } from "@margem/shared";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { EmbeddingsService } from "./embeddings.service";
import { extractKeywords, keywordScore } from "./keywords";
import { SearchIndexService } from "./search-index.service";

export const MAX_CONTEXT_CHUNKS = 6;
export const MAX_CONTEXT_NOTE_BLOCKS = 6;
const ES_CANDIDATES = 12;
const MAX_NOTES_SCANNED = 50;

export interface ContextChunk {
  id: string;
  sourceId: string;
  title: string;
  page: number | null;
  text: string;
}

export interface ContextNoteBlock {
  noteId: string;
  blockId: string;
  title: string;
  text: string;
}

export interface NotebookContext {
  chunks: ContextChunk[];
  noteBlocks: ContextNoteBlock[];
  retrieval: "hybrid" | "postgres";
}

export interface NotebookContextQuery {
  userId: string;
  notebookId: string;
  question: string;
  sourceIds?: string[];
}

@Injectable()
export class NotebookContextService {
  private readonly logger = new Logger(NotebookContextService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly embeddings: EmbeddingsService,
    private readonly searchIndex: SearchIndexService,
  ) {}

  async gather(query: NotebookContextQuery): Promise<NotebookContext> {
    const terms = extractKeywords(query.question);
    const [chunkResult, noteBlocks] = await Promise.all([
      this.findChunks(query, terms),
      this.findNoteBlocks(query, terms),
    ]);
    return { chunks: chunkResult.chunks, noteBlocks, retrieval: chunkResult.retrieval };
  }

  private async findChunks(
    query: NotebookContextQuery,
    terms: string[],
  ): Promise<{ chunks: ContextChunk[]; retrieval: NotebookContext["retrieval"] }> {
    const sourceWhere: Prisma.SourceWhereInput = {
      notebookId: query.notebookId,
      deletedAt: null,
      status: "ready",
      ...(query.sourceIds ? { id: { in: query.sourceIds } } : {}),
    };

    if (this.searchIndex.isConfigured()) {
      const vectors = await this.embeddings.embed([query.question]);
      const hits = await this.searchIndex.searchChunks({
        notebookId: query.notebookId,
        query: query.question,
        embedding: vectors?.[0] ?? null,
        limit: ES_CANDIDATES,
        sourceIds: query.sourceIds,
      });
      if (hits !== null) {
        const chunks = await this.rereadInOrder(
          hits.map((hit) => hit.id),
          sourceWhere,
        );
        return { chunks, retrieval: "hybrid" };
      }
    }

    this.logger.warn({ notebookId: query.notebookId }, "search.context_postgres_fallback");
    if (terms.length === 0) return { chunks: [], retrieval: "postgres" };
    const sourceFilter = query.sourceIds
      ? Prisma.sql`AND s."id" IN (${Prisma.join(query.sourceIds)})`
      : Prisma.empty;
    const ranked = await this.prisma.$queryRaw<Array<{ id: string }>>`
      SELECT c."id"
      FROM "SourceChunk" c
      JOIN "Source" s ON s."id" = c."sourceId"
      CROSS JOIN to_tsquery('portuguese', ${terms.join(" | ")}) q
      WHERE s."notebookId" = ${query.notebookId}
        AND s."deleted_date" IS NULL
        AND s."status" = 'ready'
        ${sourceFilter}
        AND to_tsvector('portuguese', c."text") @@ q
      ORDER BY ts_rank(to_tsvector('portuguese', c."text"), q) DESC, c."sourceId", c."ord"
      LIMIT ${MAX_CONTEXT_CHUNKS}
    `;
    const chunks = await this.rereadInOrder(
      ranked.map((row) => row.id),
      sourceWhere,
    );
    return { chunks, retrieval: "postgres" };
  }

  private async rereadInOrder(
    ids: string[],
    sourceWhere: Prisma.SourceWhereInput,
  ): Promise<ContextChunk[]> {
    if (ids.length === 0) return [];
    const rows = await this.prisma.sourceChunk.findMany({
      where: { id: { in: ids }, source: sourceWhere },
      select: CHUNK_SELECT,
    });
    const byId = new Map(rows.map((row) => [row.id, row]));
    return ids
      .flatMap((id) => {
        const row = byId.get(id);
        return row ? [toContextChunk(row)] : [];
      })
      .slice(0, MAX_CONTEXT_CHUNKS);
  }

  private async findNoteBlocks(
    query: NotebookContextQuery,
    terms: string[],
  ): Promise<ContextNoteBlock[]> {
    if (terms.length === 0) return [];
    const notes = await this.prisma.note.findMany({
      where: {
        notebookId: query.notebookId,
        authorId: query.userId,
        deletedAt: null,
        notebook: { ownerId: query.userId, deletedAt: null },
        ...(query.sourceIds ? { sourceId: { in: query.sourceIds } } : {}),
      },
      select: { id: true, title: true, doc: true },
      orderBy: { updatedAt: "desc" },
      take: MAX_NOTES_SCANNED,
    });

    const blocks: ContextNoteBlock[] = [];
    for (const note of notes) {
      if (!note.doc || typeof note.doc !== "object" || Array.isArray(note.doc)) continue;
      for (const block of extractNoteBlocks(note.doc as Record<string, unknown>)) {
        blocks.push({
          noteId: note.id,
          blockId: block.blockId,
          title: note.title || "Sem título",
          text: block.text,
        });
      }
    }
    return rankByTerms(blocks, terms).slice(0, MAX_CONTEXT_NOTE_BLOCKS);
  }
}

const CHUNK_SELECT = {
  id: true,
  sourceId: true,
  page: true,
  text: true,
  source: { select: { title: true } },
} as const;

function toContextChunk(row: {
  id: string;
  sourceId: string;
  page: number | null;
  text: string;
  source: { title: string };
}): ContextChunk {
  return {
    id: row.id,
    sourceId: row.sourceId,
    title: row.source.title,
    page: row.page,
    text: row.text,
  };
}

function rankByTerms<T extends { text: string }>(items: T[], terms: string[]): T[] {
  return items
    .map((item, index) => ({ item, index, score: keywordScore(item.text, terms) }))
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map((entry) => entry.item);
}
