import { BadRequestException, NotFoundException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { PolicyService } from "../policies/policy.service";
import type { PrismaService } from "../prisma/prisma.service";
import { chunkText } from "./chunk-text";
import { isPdfBuffer } from "./pdf-validation";
import { SourceIngestQueue } from "./source-ingest.queue";
import { SourcesService } from "./sources.service";
import type { StorageService } from "./storage.service";

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

describe("isPdfBuffer", () => {
  it("accepts %PDF- header and rejects arbitrary bytes", () => {
    expect(isPdfBuffer(Buffer.from("%PDF-1.7\n..."))).toBe(true);
    expect(isPdfBuffer(Buffer.from("<html>not a pdf</html>"))).toBe(false);
    expect(isPdfBuffer(Buffer.from("PDF"))).toBe(false);
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

    const storage = {} as StorageService;
    const queue = new SourceIngestQueue(prisma, storage);
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

    const queue = { enqueue: vi.fn() } as unknown as SourceIngestQueue;
    const storage = {} as StorageService;
    const service = new SourcesService(prisma, new PolicyService(), queue, storage);

    await expect(
      service.createText("user-2", { notebookId: "nb-1", title: "Aula", content: "Texto" }),
    ).rejects.toThrow(NotFoundException);
    await expect(service.getById("user-2", "src-1")).rejects.toThrow(NotFoundException);
    await expect(service.getSignedFileUrl("user-2", "src-1")).rejects.toThrow(NotFoundException);
  });

  it("uploads a valid PDF with generated storageKey, enqueues ingestion and rejects non-PDF", async () => {
    const putObject = vi.fn(async () => undefined);
    const enqueue = vi.fn(async () => undefined);
    const now = new Date();

    const prisma = {
      notebook: {
        findUnique: vi.fn(async () => ({ id: "nb-1", ownerId: "user-1", deletedAt: null })),
      },
      source: {
        count: vi.fn(async () => 0),
        create: vi.fn(
          async ({
            data,
          }: {
            data: {
              notebookId: string;
              type: string;
              title: string;
              storageKey: string;
              status: string;
            };
          }) => ({
            id: "src-pdf-1",
            ...data,
            content: null,
            url: null,
            failureReason: null,
            deletedAt: null,
            createdAt: now,
            updatedAt: now,
          }),
        ),
      },
      auditLog: {
        create: vi.fn(async () => ({})),
      },
      $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(prisma)),
    } as unknown as PrismaService;

    const service = new SourcesService(
      prisma,
      new PolicyService(),
      { enqueue } as unknown as SourceIngestQueue,
      { putObject } as unknown as StorageService,
    );

    await expect(
      service.createFile("user-1", {
        notebookId: "nb-1",
        title: "falso.pdf",
        buffer: Buffer.from("not a pdf"),
      }),
    ).rejects.toThrow(BadRequestException);

    const created = await service.createFile("user-1", {
      notebookId: "nb-1",
      title: "../../malicioso.pdf",
      buffer: Buffer.from("%PDF-1.7\ncontent"),
    });

    expect(created.status).toBe("queued");
    expect(putObject).toHaveBeenCalledTimes(1);
    const [key] = putObject.mock.calls[0] as unknown as [string];
    expect(key).toMatch(/^sources\/nb-1\/[0-9a-f-]+\.pdf$/);
    expect(enqueue).toHaveBeenCalledWith("src-pdf-1");
  });

  it("blocks private/metadata URLs and queues valid public links", async () => {
    const enqueue = vi.fn(async () => undefined);
    const now = new Date();

    const prisma = {
      notebook: {
        findUnique: vi.fn(async () => ({ id: "nb-1", ownerId: "user-1", deletedAt: null })),
      },
      source: {
        count: vi.fn(async () => 0),
        create: vi.fn(
          async ({
            data,
          }: {
            data: { notebookId: string; type: string; title: string; url: string; status: string };
          }) => ({
            id: "src-link-1",
            ...data,
            content: null,
            storageKey: null,
            failureReason: null,
            deletedAt: null,
            createdAt: now,
            updatedAt: now,
          }),
        ),
      },
      auditLog: {
        create: vi.fn(async () => ({})),
      },
      $transaction: vi.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn(prisma)),
    } as unknown as PrismaService;

    const service = new SourcesService(prisma, new PolicyService(), {
      enqueue,
    } as unknown as SourceIngestQueue);

    await expect(
      service.createLink("user-1", {
        notebookId: "nb-1",
        url: "http://169.254.169.254/latest/meta-data",
      }),
    ).rejects.toThrow(BadRequestException);

    await expect(
      service.createLink("user-1", {
        notebookId: "nb-1",
        url: "http://127.0.0.1:3001/health",
      }),
    ).rejects.toThrow(BadRequestException);

    const created = await service.createLink("user-1", {
      notebookId: "nb-1",
      url: "https://93.184.216.34/artigo",
    });

    expect(created.status).toBe("queued");
    expect(created.url).toBe("https://93.184.216.34/artigo");
    expect(enqueue).toHaveBeenCalledWith("src-link-1");
  });
});
