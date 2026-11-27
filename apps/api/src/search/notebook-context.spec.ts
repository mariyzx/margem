import { describe, expect, it, vi } from "vitest";
import type { PrismaService } from "../prisma/prisma.service";
import type { EmbeddingsService } from "./embeddings.service";
import { NotebookContextService } from "./notebook-context.service";
import type { SearchIndexService } from "./search-index.service";

const ROWS = [
  {
    id: "chunk-1",
    sourceId: "s1",
    page: 1,
    text: "Texto sem relação.",
    source: { title: "Redes" },
  },
  {
    id: "chunk-2",
    sourceId: "s1",
    page: 2,
    text: "O TCP faz controle de fluxo com janela.",
    source: { title: "Redes" },
  },
];

const NOTE_DOC = {
  type: "doc",
  content: [
    { type: "paragraph", attrs: { blockId: "b1" }, content: [{ type: "text", text: "Café." }] },
    {
      type: "paragraph",
      attrs: { blockId: "b2" },
      content: [{ type: "text", text: "Fluxo no TCP usa janela." }],
    },
  ],
};

function setup(esHits: Array<{ id: string }> | null, opts: { esConfigured?: boolean } = {}) {
  const prisma = {
    $queryRaw: vi.fn(async (..._args: unknown[]) => [{ id: "chunk-2" }]),
    sourceChunk: {
      findMany: vi.fn(async (args: { where: { id?: { in: string[] } } }) =>
        args.where.id ? ROWS.filter((row) => args.where.id!.in.includes(row.id)) : ROWS,
      ),
    },
    note: {
      findMany: vi.fn(async (_args: unknown) => [{ id: "note-1", title: "", doc: NOTE_DOC }]),
    },
  };
  const embeddings = { embed: vi.fn(async () => [[0.1, 0.2]]) };
  const searchIndex = {
    isConfigured: vi.fn(() => opts.esConfigured ?? true),
    searchChunks: vi.fn(
      async (_args: unknown) =>
        esHits?.map((hit) => ({ ...hit, sourceId: "s1", page: null, text: "stale", score: 1 })) ??
        null,
    ),
  };
  const service = new NotebookContextService(
    prisma as unknown as PrismaService,
    embeddings as unknown as EmbeddingsService,
    searchIndex as unknown as SearchIndexService,
  );
  return { service, prisma, searchIndex, embeddings };
}

const QUERY = {
  userId: "user-a",
  notebookId: "nb1",
  question: "Como o TCP faz controle de fluxo?",
};

describe("NotebookContextService", () => {
  it("rereads search hits in Postgres, keeping the search order and dropping stale ids", async () => {
    const { service, prisma, searchIndex } = setup([
      { id: "chunk-2" },
      { id: "gone" },
      { id: "chunk-1" },
    ]);
    const context = await service.gather({ ...QUERY, sourceIds: ["s1"] });

    expect(context.retrieval).toBe("hybrid");
    expect(context.chunks.map((chunk) => chunk.id)).toEqual(["chunk-2", "chunk-1"]);
    expect(context.chunks[0]!.text).toBe("O TCP faz controle de fluxo com janela.");
    expect(searchIndex.searchChunks.mock.calls[0]![0]).toMatchObject({
      notebookId: "nb1",
      sourceIds: ["s1"],
    });
    expect(prisma.sourceChunk.findMany.mock.calls[0]![0]).toMatchObject({
      where: {
        source: { notebookId: "nb1", deletedAt: null, status: "ready", id: { in: ["s1"] } },
      },
    });
  });

  it("falls back to a ranked full-text search in Postgres when Elasticsearch fails", async () => {
    const { service, prisma } = setup(null);
    const context = await service.gather(QUERY);

    expect(context.retrieval).toBe("postgres");
    expect(context.chunks.map((chunk) => chunk.id)).toEqual(["chunk-2"]);
    const [sql, ...values] = prisma.$queryRaw.mock.calls[0]!;
    expect((sql as string[]).join("?")).toContain("ts_rank");
    expect(values).toContain("tcp | faz | controle | fluxo");
    expect(values).toContain("nb1");
    expect(prisma.sourceChunk.findMany.mock.calls[0]![0]).toMatchObject({
      where: { id: { in: ["chunk-2"] }, source: { notebookId: "nb1", deletedAt: null } },
    });
  });

  it("skips embeddings and Elasticsearch when the index is not configured", async () => {
    const { service, embeddings, searchIndex } = setup([], { esConfigured: false });
    const context = await service.gather(QUERY);

    expect(context.retrieval).toBe("postgres");
    expect(embeddings.embed).not.toHaveBeenCalled();
    expect(searchIndex.searchChunks).not.toHaveBeenCalled();
  });

  it("only reads the person's own notes in that notebook and ranks matching blocks", async () => {
    const { service, prisma } = setup([]);
    const context = await service.gather(QUERY);

    expect(context.noteBlocks).toEqual([
      { noteId: "note-1", blockId: "b2", title: "Sem título", text: "Fluxo no TCP usa janela." },
    ]);
    expect(prisma.note.findMany.mock.calls[0]![0]).toMatchObject({
      where: {
        notebookId: "nb1",
        authorId: "user-a",
        deletedAt: null,
        notebook: { ownerId: "user-a", deletedAt: null },
      },
    });
  });

  it("skips Postgres lookups when the question has no useful terms and the index is down", async () => {
    const { service, prisma } = setup(null);
    const context = await service.gather({ ...QUERY, question: "o que é?" });

    expect(context).toEqual({ chunks: [], noteBlocks: [], retrieval: "postgres" });
    expect(prisma.$queryRaw).not.toHaveBeenCalled();
    expect(prisma.note.findMany).not.toHaveBeenCalled();
  });
});
