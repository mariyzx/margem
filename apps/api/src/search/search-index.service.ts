import { Injectable, Logger } from "@nestjs/common";
import { loadEnv } from "../config/env";

const ES_TIMEOUT_MS = 5_000;
const EMBEDDING_DIMS = 768;

export const CHUNKS_INDEX = "chunks";
export const NOTES_INDEX = "notes";

export interface ChunkIndexDoc {
  id: string;
  sourceId: string;
  notebookId: string;
  ord: number;
  page: number | null;
  text: string;
  embedding?: number[];
}

export interface NoteBlockIndexDoc {
  id: string;
  noteId: string;
  notebookId: string;
  blockId: string;
  origin: "memory" | "material";
  text: string;
  embedding?: number[];
}

@Injectable()
export class SearchIndexService {
  private readonly logger = new Logger(SearchIndexService.name);
  private indicesEnsured = false;

  private getBaseUrl(): string | null {
    const url = loadEnv().ELASTICSEARCH_URL;
    return url ? url.replace(/\/+$/, "") : null;
  }

  isConfigured(): boolean {
    return this.getBaseUrl() !== null;
  }

  async ensureIndices(): Promise<boolean> {
    if (this.indicesEnsured) return true;
    const baseUrl = this.getBaseUrl();
    if (!baseUrl) return false;

    try {
      const okChunks = await this.ensureIndex(baseUrl, CHUNKS_INDEX, {
        mappings: {
          properties: {
            sourceId: { type: "keyword" },
            notebookId: { type: "keyword" },
            ord: { type: "integer" },
            page: { type: "integer" },
            text: { type: "text", analyzer: "portuguese" },
            embedding: {
              type: "dense_vector",
              dims: EMBEDDING_DIMS,
              index: true,
              similarity: "cosine",
            },
          },
        },
      });

      const okNotes = await this.ensureIndex(baseUrl, NOTES_INDEX, {
        mappings: {
          properties: {
            noteId: { type: "keyword" },
            notebookId: { type: "keyword" },
            blockId: { type: "keyword" },
            origin: { type: "keyword" },
            text: { type: "text", analyzer: "portuguese" },
            embedding: {
              type: "dense_vector",
              dims: EMBEDDING_DIMS,
              index: true,
              similarity: "cosine",
            },
          },
        },
      });

      this.indicesEnsured = okChunks && okNotes;
      return this.indicesEnsured;
    } catch (error) {
      this.logger.warn(
        { error: error instanceof Error ? error.message : String(error) },
        "Elasticsearch unavailable when ensuring indices",
      );
      return false;
    }
  }

  private async ensureIndex(
    baseUrl: string,
    index: string,
    body: Record<string, unknown>,
  ): Promise<boolean> {
    const head = await fetch(`${baseUrl}/${index}`, {
      method: "HEAD",
      signal: AbortSignal.timeout(ES_TIMEOUT_MS),
    });
    if (head.ok) return true;
    if (head.status !== 404) return false;

    const create = await fetch(`${baseUrl}/${index}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(ES_TIMEOUT_MS),
    });
    return create.ok;
  }

  async indexChunks(docs: ChunkIndexDoc[]): Promise<boolean> {
    if (docs.length === 0) return true;
    const baseUrl = this.getBaseUrl();
    if (!baseUrl) return false;

    const ready = await this.ensureIndices();
    if (!ready) return false;

    const lines: string[] = [];
    for (const doc of docs) {
      lines.push(JSON.stringify({ index: { _index: CHUNKS_INDEX, _id: doc.id } }));
      lines.push(
        JSON.stringify({
          sourceId: doc.sourceId,
          notebookId: doc.notebookId,
          ord: doc.ord,
          page: doc.page,
          text: doc.text,
          ...(doc.embedding ? { embedding: doc.embedding } : {}),
        }),
      );
    }

    try {
      const res = await fetch(`${baseUrl}/_bulk`, {
        method: "POST",
        headers: { "Content-Type": "application/x-ndjson" },
        body: `${lines.join("\n")}\n`,
        signal: AbortSignal.timeout(ES_TIMEOUT_MS),
      });
      if (!res.ok) {
        this.logger.warn({ status: res.status }, "Elasticsearch bulk index failed");
        return false;
      }
      return true;
    } catch (error) {
      this.logger.warn(
        { error: error instanceof Error ? error.message : String(error) },
        "Elasticsearch unavailable during bulk index",
      );
      return false;
    }
  }

  async searchChunks(params: {
    notebookId: string;
    query: string;
    embedding: number[] | null;
    limit: number;
    sourceIds?: string[];
  }): Promise<Array<{
    id: string;
    sourceId: string;
    page: number | null;
    text: string;
    score: number;
  }> | null> {
    const baseUrl = this.getBaseUrl();
    if (!baseUrl) return null;

    const ready = await this.ensureIndices();
    if (!ready) return null;

    const filter: Array<Record<string, unknown>> = [{ term: { notebookId: params.notebookId } }];
    if (params.sourceIds) filter.push({ terms: { sourceId: params.sourceIds } });

    const body: Record<string, unknown> = {
      size: params.limit,
      query: {
        bool: {
          filter,
          must: [{ match: { text: params.query } }],
        },
      },
      ...(params.embedding
        ? {
            knn: {
              field: "embedding",
              query_vector: params.embedding,
              k: params.limit,
              num_candidates: Math.max(params.limit * 4, 20),
              filter,
            },
          }
        : {}),
    };

    try {
      const res = await fetch(`${baseUrl}/${CHUNKS_INDEX}/_search`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(ES_TIMEOUT_MS),
      });
      if (!res.ok) {
        this.logger.warn({ status: res.status }, "Elasticsearch search failed, falling back");
        return null;
      }
      const data = (await res.json()) as {
        hits?: {
          hits?: Array<{
            _id: string;
            _score?: number | null;
            _source?: { sourceId?: string; page?: number | null; text?: string };
          }>;
        };
      };
      return (data.hits?.hits ?? []).map((hit) => ({
        id: hit._id,
        sourceId: hit._source?.sourceId ?? "",
        page: hit._source?.page ?? null,
        text: hit._source?.text ?? "",
        score: hit._score ?? 0,
      }));
    } catch (error) {
      this.logger.warn(
        { error: error instanceof Error ? error.message : String(error) },
        "Elasticsearch unavailable during search, falling back",
      );
      return null;
    }
  }
}
