import { ConflictException, NotFoundException, UnprocessableEntityException } from "@nestjs/common";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AiService } from "../ai/ai.service";
import { AiUnavailableException } from "../ai/ai-errors";
import type { PrismaService } from "../prisma/prisma.service";
import { PracticeService } from "./practice.service";

const NOW = new Date("2026-11-27T12:00:00Z");
const CHUNKS = [
  { id: "chunk-1", text: "O TCP usa janela deslizante para controle de fluxo." },
  { id: "chunk-2", text: "O UDP não garante entrega nem ordem." },
];

function row(data: Record<string, unknown>) {
  return { id: "p-new", createdAt: NOW, updatedAt: NOW, deletedAt: null, ...data };
}

function setup(opts: { source?: unknown; owned?: number; status?: string } = {}) {
  let status = opts.status ?? "pending";
  const prisma = {
    source: {
      findFirst: vi.fn(async (args: { where: { notebook: { ownerId: string } } }) =>
        args.where.notebook.ownerId === "user-a"
          ? (opts.source ?? { id: "s1", notebookId: "nb1", status: "ready" })
          : null,
      ),
    },
    sourceChunk: { findMany: vi.fn(async (_args: unknown) => CHUNKS) },
    practiceItem: {
      count: vi.fn(async (_args: unknown) => opts.owned ?? 0),
      updateMany: vi.fn(async (args: { where: { id?: string }; data: { status: string } }) => {
        if (!args.where.id) return { count: 2 };
        if (status !== "pending") return { count: 0 };
        status = args.data.status;
        return { count: 1 };
      }),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => row(data)),
      findMany: vi.fn(async (_args: unknown) => []),
      findFirst: vi.fn(async (args: { where: { notebook: { ownerId: string } } }) =>
        args.where.notebook.ownerId === "user-a" ? { id: "p1", status, sourceId: "s1" } : null,
      ),
      findUniqueOrThrow: vi.fn(async () =>
        row({
          id: "p1",
          notebookId: "nb1",
          sourceId: "s1",
          sourceChunkId: "chunk-1",
          kind: "quiz",
          prompt: "P?",
          answer: "R.",
          createdBy: "ai",
          status,
        }),
      ),
      update: vi.fn(async (_args: unknown) => ({})),
    },
    reviewItem: { create: vi.fn(async (_args: { data: Record<string, unknown> }) => ({})) },
    auditLog: { create: vi.fn(async (_args: unknown) => ({})) },
  };
  Object.assign(prisma, {
    $transaction: vi.fn(async (cb: (tx: unknown) => Promise<unknown>) => cb(prisma)),
  });
  const ai = {
    completeJson: vi.fn(async (..._args: unknown[]) => ({
      provider: "groq",
      data: {
        items: [
          {
            kind: "quiz",
            prompt: "Para que serve a janela deslizante?",
            answer: "Controle de fluxo.",
            sourceChunkId: "c1",
          },
          {
            kind: "cloze",
            prompt: "O UDP não garante ____ nem ordem.",
            answer: "entrega",
            sourceChunkId: "c2",
          },
          { kind: "why", prompt: "Por que inventado?", answer: "x", sourceChunkId: "c9" },
        ],
      },
    })),
  };
  const service = new PracticeService(
    prisma as unknown as PrismaService,
    ai as unknown as AiService,
  );
  return { service, prisma, ai };
}

describe("PracticeService.generate", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("saves grounded items as pending AI practice tied to their chunk, never in the review", async () => {
    const { service, prisma, ai } = setup();

    const { items } = await service.generate("user-a", "s1", {});

    expect(ai.completeJson.mock.calls[0]![1]).toBe("generate-practice");
    expect(items).toHaveLength(2);
    expect(prisma.practiceItem.create.mock.calls.map(([args]) => args.data)).toEqual([
      expect.objectContaining({
        kind: "quiz",
        sourceChunkId: "chunk-1",
        status: "pending",
        createdBy: "ai",
        notebookId: "nb1",
      }),
      expect.objectContaining({ kind: "cloze", sourceChunkId: "chunk-2", status: "pending" }),
    ]);
    expect(prisma.reviewItem.create).not.toHaveBeenCalled();
  });

  it("replaces the previous pending AI practice of the source", async () => {
    const { service, prisma } = setup();
    await service.generate("user-a", "s1", {});
    expect(prisma.practiceItem.updateMany).toHaveBeenCalledWith({
      where: { sourceId: "s1", createdBy: "ai", status: "pending", deletedAt: null },
      data: { status: "discarded", deletedAt: expect.any(Date) },
    });
  });

  it("asks only for the requested kinds", async () => {
    const { service, ai } = setup();
    await service.generate("user-a", "s1", { kinds: ["flashcard"] });
    const prompt = JSON.stringify(ai.completeJson.mock.calls[0]![2]);
    expect(prompt).toContain("flashcard");
    expect(prompt).not.toContain('\\"cloze\\"');
  });

  it("answers 404 for someone else's source without calling the AI", async () => {
    const { service, ai } = setup();
    await expect(service.generate("user-b", "s1", {})).rejects.toBeInstanceOf(NotFoundException);
    expect(ai.completeJson).not.toHaveBeenCalled();
  });

  it("does nothing for a source that is not ready", async () => {
    const { service, ai } = setup({
      source: { id: "s1", notebookId: "nb1", status: "processing" },
    });
    await expect(service.generate("user-a", "s1", {})).resolves.toEqual({ items: [] });
    expect(ai.completeJson).not.toHaveBeenCalled();
  });

  it("checks the practice quota before calling the AI", async () => {
    vi.stubEnv("MAX_PRACTICE_ITEMS_PER_USER", "5");
    const { service, ai } = setup({ owned: 5 });
    await expect(service.generate("user-a", "s1", {})).rejects.toBeInstanceOf(
      UnprocessableEntityException,
    );
    expect(ai.completeJson).not.toHaveBeenCalled();
  });

  it("lets ai_unavailable through and saves nothing", async () => {
    const { service, prisma, ai } = setup();
    ai.completeJson.mockRejectedValueOnce(new AiUnavailableException("quota"));
    await expect(service.generate("user-a", "s1", {})).rejects.toBeInstanceOf(
      AiUnavailableException,
    );
    expect(prisma.practiceItem.create).not.toHaveBeenCalled();
  });
});

describe("PracticeService approve and discard", () => {
  it("approving puts the practice in the review once, even with two clicks", async () => {
    const { service, prisma } = setup();

    await Promise.all([service.approve("user-a", "p1"), service.approve("user-a", "p1")]);

    expect(prisma.reviewItem.create).toHaveBeenCalledTimes(1);
    expect(prisma.reviewItem.create.mock.calls[0]![0].data).toMatchObject({
      userId: "user-a",
      kind: "practice",
      refId: "p1",
    });
  });

  it("discarding a pending practice hides it without a review item", async () => {
    const { service, prisma } = setup();
    await service.discard("user-a", "p1");
    expect(prisma.practiceItem.update).toHaveBeenCalledWith({
      where: { id: "p1" },
      data: { status: "discarded", deletedAt: expect.any(Date) },
    });
    expect(prisma.reviewItem.create).not.toHaveBeenCalled();
  });

  it("an approved practice can't be discarded", async () => {
    const { service } = setup({ status: "approved" });
    await expect(service.discard("user-a", "p1")).rejects.toBeInstanceOf(ConflictException);
  });

  it("user B can neither list, approve nor discard user A's practice", async () => {
    const { service, prisma } = setup();
    await expect(service.listForSource("user-b", "s1")).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.approve("user-b", "p1")).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.discard("user-b", "p1")).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.reviewItem.create).not.toHaveBeenCalled();
  });
});
