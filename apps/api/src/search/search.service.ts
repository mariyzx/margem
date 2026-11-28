import { Injectable } from "@nestjs/common";
import type { SearchHitDto, SearchQueryInput } from "@margem/shared";
import { PolicyService } from "../policies/policy.service";
import { PrismaService } from "../prisma/prisma.service";
import { EmbeddingsService } from "./embeddings.service";
import { SearchIndexService } from "./search-index.service";

function makeSnippet(text: string, maxLen = 180): string {
  const clean = text.replace(/\s+/g, " ").trim();
  if (clean.length <= maxLen) return clean;
  return `${clean.slice(0, maxLen - 1)}…`;
}

@Injectable()
export class SearchService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly policy: PolicyService,
    private readonly embeddings: EmbeddingsService,
    private readonly searchIndex: SearchIndexService,
  ) {}

  async search(userId: string, input: SearchQueryInput): Promise<SearchHitDto[]> {
    const notebook = await this.prisma.notebook.findUnique({
      where: { id: input.notebookId },
      select: { id: true, ownerId: true, deletedAt: true },
    });
    this.policy.assertOwner(userId, notebook?.deletedAt ? null : notebook?.ownerId);

    const vectors = this.searchIndex.isConfigured() ? await this.embeddings.embed([input.q]) : null;
    const queryVector = vectors?.[0] ?? null;

    const esHits = await this.searchIndex.searchChunks({
      notebookId: input.notebookId,
      query: input.q,
      embedding: queryVector,
      limit: input.limit,
    });

    const chunkHits: SearchHitDto[] = [];

    if (esHits !== null) {
      const sourceIds = [...new Set(esHits.map((h) => h.sourceId).filter(Boolean))];
      const sources =
        sourceIds.length > 0
          ? await this.prisma.source.findMany({
              where: { id: { in: sourceIds }, deletedAt: null },
              select: { id: true, title: true },
            })
          : [];
      const titleById = new Map(sources.map((s) => [s.id, s.title]));

      for (const hit of esHits) {
        const title = titleById.get(hit.sourceId);
        if (!title) continue;
        chunkHits.push({
          kind: "chunk",
          id: hit.id,
          title,
          snippet: makeSnippet(hit.text),
          sourceId: hit.sourceId,
          noteId: null,
          page: hit.page,
          score: hit.score,
        });
      }
    } else {
      const pgChunks = await this.prisma.sourceChunk.findMany({
        where: {
          source: { notebookId: input.notebookId, deletedAt: null },
          text: { contains: input.q, mode: "insensitive" },
        },
        include: { source: { select: { title: true } } },
        take: input.limit,
      });

      for (const chunk of pgChunks) {
        chunkHits.push({
          kind: "chunk",
          id: chunk.id,
          title: chunk.source.title,
          snippet: makeSnippet(chunk.text),
          sourceId: chunk.sourceId,
          noteId: null,
          page: chunk.page,
          score: 1,
        });
      }
    }

    const matchingNotes = await this.prisma.note.findMany({
      where: {
        notebookId: input.notebookId,
        deletedAt: null,
        title: { contains: input.q, mode: "insensitive" },
      },
      select: { id: true, title: true },
      take: 5,
    });

    const noteHits: SearchHitDto[] = matchingNotes.map((note) => ({
      kind: "note",
      id: note.id,
      title: note.title || "Sem título",
      snippet: note.title || "Sem título",
      sourceId: null,
      noteId: note.id,
      page: null,
      score: 1.5,
    }));

    return [...noteHits, ...chunkHits].slice(0, input.limit);
  }
}
