import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { EmbeddingsService } from "./embeddings.service";
import { SearchIndexService } from "./search-index.service";
import { NotFoundException } from "@nestjs/common";
import { PolicyService } from "../policies/policy.service";
import type { PrismaService } from "../prisma/prisma.service";
import { SearchService } from "./search.service";

describe("EmbeddingsService", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.DATABASE_URL = "postgresql://margem:margem@localhost:5432/margem";
    process.env.REDIS_URL = "redis://localhost:6379";
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  it("returns null when OLLAMA_URL is not configured", async () => {
    delete process.env.OLLAMA_URL;
    const service = new EmbeddingsService();
    expect(await service.embed(["teste"])).toBeNull();
  });

  it("returns embeddings from Ollama and falls back to null on error", async () => {
    process.env.OLLAMA_URL = "http://127.0.0.1:11434";
    const service = new EmbeddingsService();

    vi.spyOn(globalThis, "fetch").mockResolvedValueOnce(
      new Response(JSON.stringify({ embeddings: [[0.1, 0.2, 0.3]] }), { status: 200 }),
    );
    expect(await service.embed(["consenso raft"])).toEqual([[0.1, 0.2, 0.3]]);

    vi.spyOn(globalThis, "fetch").mockRejectedValueOnce(new Error("connect ECONNREFUSED"));
    expect(await service.embed(["consenso raft"])).toBeNull();
  });
});

describe("SearchIndexService", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    process.env.DATABASE_URL = "postgresql://margem:margem@localhost:5432/margem";
    process.env.REDIS_URL = "redis://localhost:6379";
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  it("returns false gracefully when ELASTICSEARCH_URL is missing", async () => {
    delete process.env.ELASTICSEARCH_URL;
    const service = new SearchIndexService();
    expect(await service.ensureIndices()).toBe(false);
  });

  it("creates indices if missing and sends ndjson bulk payload", async () => {
    process.env.ELASTICSEARCH_URL = "http://127.0.0.1:9200";
    const service = new SearchIndexService();

    const fetchSpy = vi
      .spyOn(globalThis, "fetch")
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ acknowledged: true }), { status: 200 }))
      .mockResolvedValueOnce(new Response(null, { status: 404 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ acknowledged: true }), { status: 200 }))
      .mockResolvedValueOnce(new Response(JSON.stringify({ errors: false }), { status: 200 }));

    const ok = await service.indexChunks([
      {
        id: "chunk-1",
        sourceId: "src-1",
        notebookId: "nb-1",
        ord: 0,
        page: 1,
        text: "Algoritmo Raft",
      },
    ]);

    expect(ok).toBe(true);
    expect(fetchSpy).toHaveBeenCalledTimes(5);
    const bulkCall = fetchSpy.mock.calls[4]!;
    expect(bulkCall[0]).toBe("http://127.0.0.1:9200/_bulk");
  });
});

describe("SearchService", () => {
  it("returns 404 when searching another user's notebook", async () => {
    const prisma = {
      notebook: {
        findUnique: vi.fn(async () => ({ id: "nb-1", ownerId: "user-1", deletedAt: null })),
      },
    } as unknown as PrismaService;

    const service = new SearchService(
      prisma,
      new PolicyService(),
      { embed: vi.fn(async () => null) } as unknown as EmbeddingsService,
      {
        isConfigured: () => false,
        searchChunks: vi.fn(async () => null),
      } as unknown as SearchIndexService,
    );

    await expect(
      service.search("user-2", { notebookId: "nb-1", q: "raft", limit: 10 }),
    ).rejects.toThrow(NotFoundException);
  });

  it("falls back to Postgres when Elasticsearch is unavailable and returns notes + chunks", async () => {
    const prisma = {
      notebook: {
        findUnique: vi.fn(async () => ({ id: "nb-1", ownerId: "user-1", deletedAt: null })),
      },
      sourceChunk: {
        findMany: vi.fn(async () => [
          {
            id: "chunk-1",
            sourceId: "src-1",
            page: 2,
            text: "O algoritmo Raft divide o consenso em eleição e replicação.",
            source: { title: "Aula Raft.pdf" },
          },
        ]),
      },
      note: {
        findMany: vi.fn(async () => [{ id: "note-1", title: "Resumo de Raft" }]),
      },
    } as unknown as PrismaService;

    const embeddings = { embed: vi.fn(async () => null) };
    const service = new SearchService(
      prisma,
      new PolicyService(),
      embeddings as unknown as EmbeddingsService,
      {
        isConfigured: () => false,
        searchChunks: vi.fn(async () => null),
      } as unknown as SearchIndexService,
    );

    const hits = await service.search("user-1", { notebookId: "nb-1", q: "Raft", limit: 10 });
    expect(hits).toHaveLength(2);
    expect(hits[0]).toMatchObject({ kind: "note", id: "note-1", title: "Resumo de Raft" });
    expect(hits[1]).toMatchObject({
      kind: "chunk",
      id: "chunk-1",
      title: "Aula Raft.pdf",
      page: 2,
    });
    expect(embeddings.embed).not.toHaveBeenCalled();
  });
});
