import { NotFoundException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { PolicyService } from "../policies/policy.service";
import type { PrismaService } from "../prisma/prisma.service";
import { chunkText } from "./chunk-text";
import { SourceIngestQueue } from "./source-ingest.queue";
import { SourcesService } from "./sources.service";

describe("chunkText", () => {
  it("returns empty array for blank text and single chunk for short text", () => {
    expect(chunkText("   \n\n  ")).toEqual([]);
    expect(chunkText("Resumo curto sobre redes.")).toEqual(["Resumo curto sobre redes."]);
  });

  it("splits long text by paragraphs without exceeding maxChars", () => {
    const p1 = "A".repeat(700);
    const p2 = "B".repeat(700);
    const chunks = chunkText(`${p1}\n\n${p2}`, 1000, 100);
    expect(chunks).toEqual([p1, p2]);
  });

  it("splits oversized single paragraph with overlap", () => {
    const longPara = "X".repeat(250);
    const chunks = chunkText(longPara, 100, 20);
    expect(chunks.length).toBeGreaterThan(2);
    expect(chunks.every((c) => c.length <= 100)).toBe(true);
  });
});

describe("SourceIngestQueue", () => {
  it("processes a queued text source into SourceChunks and marks it ready", async () => {
    const createdChunks: Array<{ sourceId: string; ord: number; text: string }> = [];
    const updates: Array<{ status?: string }> = [];

    const prisma = {
      source: {
        findUnique: vi.fn(async () => ({
          id: "src-1",
          type: "text",
          content: "Primeiro parágrafo.\n\nSegundo parágrafo.",
          deletedAt: null,
        })),
        update: vi.fn(async ({ data }: { data: { status?: string } }) => {
          updates.push(data);
          return {};
        }),
      },
      sourceChunk: {
        deleteMany: vi.fn(async () => ({ count: 0 })),
        createMany: vi.fn(
          async ({ data }: { data: Array<{ sourceId: string; ord: number; text: string }> }) => {
            createdChunks.push(...data);
            return { count: data.length };
          },
        ),
      },
      $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(prisma)),
    } as unknown as PrismaService;

    const queue = new SourceIngestQueue(prisma);
    await queue.processJob("src-1");

    expect(updates.map((u) => u.status)).toEqual(["processing", "ready"]);
    expect(createdChunks).toHaveLength(1);
    expect(createdChunks[0]?.ord).toBe(0);
  });
});

describe("SourcesService", () => {
  it("returns 404 when another user accesses or creates a source in someone else's notebook", async () => {
    const prisma = {
      notebook: {
        findUnique: vi.fn(async () => ({ id: "nb-1", ownerId: "user-1", deletedAt: null })),
      },
      source: {
        findUnique: vi.fn(async () => ({
          id: "src-1",
          notebookId: "nb-1",
          deletedAt: null,
          notebook: { ownerId: "user-1", deletedAt: null },
        })),
      },
    } as unknown as PrismaService;

    const service = new SourcesService(prisma, new PolicyService());

    await expect(
      service.createText("user-2", { notebookId: "nb-1", title: "Aula", content: "Texto" }),
    ).rejects.toThrow(NotFoundException);
    await expect(service.getById("user-2", "src-1")).rejects.toThrow(NotFoundException);
  });
});
