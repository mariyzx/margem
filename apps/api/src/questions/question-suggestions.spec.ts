import { ConflictException, NotFoundException, UnprocessableEntityException } from "@nestjs/common";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AiService } from "../ai/ai.service";
import { AiUnavailableException } from "../ai/ai-errors";
import type { SuggestClozesQuestionsOutput } from "../ai/prompts/suggest-clozes-questions";
import { PolicyService } from "../policies/policy.service";
import type { PrismaService } from "../prisma/prisma.service";
import { groundSuggestions, QuestionSuggestionsService } from "./question-suggestions.service";
import { QuestionsService } from "./questions.service";

const NOW = new Date("2026-11-27T12:00:00Z");
const B1 = "O TCP faz o three-way handshake antes de enviar dados.";
const B2 = "O UDP não garante entrega nem ordem.";
const DOC = {
  type: "doc",
  content: [
    { type: "paragraph", attrs: { blockId: "b1" }, content: [{ type: "text", text: B1 }] },
    { type: "paragraph", attrs: { blockId: "b2" }, content: [{ type: "text", text: B2 }] },
  ],
};

function output(partial: Partial<SuggestClozesQuestionsOutput>): SuggestClozesQuestionsOutput {
  return { clozes: [], questions: [], ...partial };
}

function makePrisma(opts: { doc?: unknown; owned?: number } = {}) {
  let seq = 0;
  const prisma = {
    note: {
      findUnique: vi.fn(async (_args: unknown) => ({
        authorId: "user-a",
        doc: opts.doc ?? DOC,
        deletedAt: null,
      })),
    },
    question: {
      count: vi.fn(async (_args: unknown) => opts.owned ?? 0),
      findMany: vi.fn(async (_args: unknown) => [{ id: "old-1", anchorId: "old-anchor" }]),
      updateMany: vi.fn(async (_args: unknown) => ({ count: 1 })),
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
        id: `q-${++seq}`,
        ...data,
        anchor: {
          id: data.anchorId,
          noteId: "note-1",
          blockId: "b1",
          quote: "q",
          prefix: "",
          suffix: "",
          status: "active",
        },
        createdAt: NOW,
        updatedAt: NOW,
      })),
    },
    anchor: {
      create: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
        id: `a-${++seq}`,
        ...data,
      })),
      updateMany: vi.fn(async (_args: unknown) => ({ count: 1 })),
    },
    auditLog: { create: vi.fn(async (_args: { data: Record<string, unknown> }) => ({})) },
  };
  return Object.assign(prisma, {
    $transaction: vi.fn(async (cb: (tx: unknown) => Promise<unknown>) => cb(prisma)),
  });
}

function makeService(prisma: ReturnType<typeof makePrisma>, result: SuggestClozesQuestionsOutput) {
  const ai = {
    completeJson: vi.fn(async (..._args: unknown[]) => ({ data: result, provider: "local" })),
  };
  const service = new QuestionSuggestionsService(
    prisma as unknown as PrismaService,
    new PolicyService(),
    ai as unknown as AiService,
  );
  return { service, ai };
}

describe("groundSuggestions", () => {
  const blocks = [
    { blockId: "b1", text: B1 },
    { blockId: "b2", text: B2 },
  ];

  it("keeps only quotes copied from a block that was sent", () => {
    const grounded = groundSuggestions(
      output({
        clozes: [
          { blockId: "b1", quote: "three-way handshake" },
          { blockId: "b1", quote: "TCP usa janela deslizante" },
          { blockId: "b9", quote: "TCP" },
          { blockId: "b2", quote: "  UDP  " },
          { blockId: "b1", quote: "three-way handshake" },
        ],
      }),
      blocks,
    );
    expect(grounded.clozes).toEqual([
      { blockId: "b1", quote: "three-way handshake" },
      { blockId: "b2", quote: "UDP" },
    ]);
  });

  it("anchors questions with context around the quote and drops empty ones", () => {
    const grounded = groundSuggestions(
      output({
        questions: [
          {
            blockId: "b1",
            quote: "three-way handshake",
            text: "Por que o TCP faz o handshake?",
            answer: "Pra combinar a conexão antes de enviar dados.",
          },
          { blockId: "b2", quote: "UDP", text: "   ", answer: "x" },
        ],
      }),
      blocks,
    );
    expect(grounded.questions).toEqual([
      {
        blockId: "b1",
        quote: "three-way handshake",
        prefix: "O TCP faz o ",
        suffix: " antes de enviar dados.",
        text: "Por que o TCP faz o handshake?",
        answer: "Pra combinar a conexão antes de enviar dados.",
      },
    ]);
  });

  it("lets a question and a cloze point at the same quote", () => {
    const grounded = groundSuggestions(
      output({
        clozes: [{ blockId: "b2", quote: "UDP" }],
        questions: [
          {
            blockId: "b2",
            quote: "UDP",
            text: "O que o UDP não garante?",
            answer: "Entrega e ordem.",
          },
        ],
      }),
      blocks,
    );
    expect(grounded.clozes).toHaveLength(1);
    expect(grounded.questions).toHaveLength(1);
  });

  it("caps how many suggestions come back", () => {
    const clozes = "O TCP faz o three-way handshake antes de enviar dados"
      .split(" ")
      .map((quote) => ({ blockId: "b1", quote }));
    expect(groundSuggestions(output({ clozes }), blocks).clozes).toHaveLength(5);
  });
});

describe("QuestionSuggestionsService.suggest", () => {
  afterEach(() => vi.unstubAllEnvs());

  const GOOD = output({
    clozes: [{ blockId: "b1", quote: "three-way handshake" }],
    questions: [
      {
        blockId: "b2",
        quote: "não garante entrega nem ordem",
        text: "O que o UDP não garante?",
        answer: "Entrega e ordem.",
      },
      { blockId: "b1", quote: "trecho inventado", text: "P?", answer: "R." },
    ],
  });

  it("saves grounded questions as pending AI suggestions and only returns the clozes", async () => {
    const prisma = makePrisma();
    const { service } = makeService(prisma, GOOD);

    const result = await service.suggest("user-a", "note-1");

    expect(result.clozes).toEqual([{ blockId: "b1", quote: "three-way handshake" }]);
    expect(result.questions).toHaveLength(1);
    expect(prisma.question.create).toHaveBeenCalledTimes(1);
    expect(prisma.question.create.mock.calls[0]![0].data).toMatchObject({
      noteId: "note-1",
      authorType: "ai",
      authorId: "user-a",
      status: "pending",
      text: "O que o UDP não garante?",
    });
    expect(prisma.anchor.create.mock.calls[0]![0].data).toMatchObject({
      blockId: "b2",
      quote: "não garante entrega nem ordem",
      prefix: "O UDP ",
      suffix: ".",
    });
  });

  it("never creates a review item for a suggestion", async () => {
    const prisma = makePrisma();
    const reviewItem = { create: vi.fn(async (_args: unknown) => ({})) };
    Object.assign(prisma, { reviewItem });
    const { service } = makeService(prisma, GOOD);

    await service.suggest("user-a", "note-1");

    expect(reviewItem.create).not.toHaveBeenCalled();
  });

  it("replaces the previous pending suggestions of the note", async () => {
    const prisma = makePrisma();
    const { service } = makeService(prisma, GOOD);

    await service.suggest("user-a", "note-1");

    expect(prisma.question.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { noteId: "note-1", authorType: "ai", status: "pending", deletedAt: null },
      }),
    );
    expect(prisma.question.updateMany).toHaveBeenCalledWith({
      where: { id: { in: ["old-1"] } },
      data: { status: "discarded", deletedAt: expect.any(Date) },
    });
  });

  it("audits counts only, never the note text", async () => {
    const prisma = makePrisma();
    const { service } = makeService(prisma, GOOD);

    await service.suggest("user-a", "note-1");

    const audit = JSON.stringify(prisma.auditLog.create.mock.calls);
    expect(audit).toContain('"action":"question.suggested"');
    expect(audit).not.toContain("UDP");
    expect(audit).not.toContain("handshake");
  });

  it("answers 404 for someone else's note without calling the AI", async () => {
    const prisma = makePrisma();
    const { service, ai } = makeService(prisma, GOOD);

    await expect(service.suggest("user-b", "note-1")).rejects.toBeInstanceOf(NotFoundException);
    expect(ai.completeJson).not.toHaveBeenCalled();
  });

  it("does not call the AI for an empty note", async () => {
    const prisma = makePrisma({ doc: { type: "doc", content: [] } });
    const { service, ai } = makeService(prisma, GOOD);

    await expect(service.suggest("user-a", "note-1")).resolves.toEqual({
      clozes: [],
      questions: [],
    });
    expect(ai.completeJson).not.toHaveBeenCalled();
  });

  it("checks the question quota before spending the AI call", async () => {
    vi.stubEnv("MAX_QUESTIONS_PER_USER", "3");
    const prisma = makePrisma({ owned: 3 });
    const { service, ai } = makeService(prisma, GOOD);

    await expect(service.suggest("user-a", "note-1")).rejects.toBeInstanceOf(
      UnprocessableEntityException,
    );
    expect(ai.completeJson).not.toHaveBeenCalled();
  });

  it("saves only what still fits in the quota", async () => {
    vi.stubEnv("MAX_QUESTIONS_PER_USER", "3");
    const prisma = makePrisma({ owned: 2 });
    const twoGood = output({
      questions: [
        { blockId: "b1", quote: "TCP", text: "O que o TCP faz?", answer: "Handshake." },
        { blockId: "b2", quote: "UDP", text: "O que o UDP não garante?", answer: "Entrega." },
      ],
    });
    const { service } = makeService(prisma, twoGood);

    await service.suggest("user-a", "note-1");

    expect(prisma.question.create).toHaveBeenCalledTimes(1);
  });

  it("lets ai_unavailable through and saves nothing", async () => {
    const prisma = makePrisma();
    const { service, ai } = makeService(prisma, GOOD);
    ai.completeJson.mockRejectedValueOnce(new AiUnavailableException("timeout"));

    await expect(service.suggest("user-a", "note-1")).rejects.toBeInstanceOf(
      AiUnavailableException,
    );
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});

describe("QuestionsService approve and discard", () => {
  function setup(status: "pending" | "approved" | "discarded", authorId = "user-a") {
    const row = { status };
    const current = () => ({
      id: "q-1",
      noteId: "note-1",
      anchorId: "a-1",
      status: row.status,
      deletedAt: null,
      note: { authorId, deletedAt: null },
      authorType: "ai" as const,
      authorId: "user-a",
      text: "P?",
      answer: "R.",
      anchor: null,
      createdAt: NOW,
      updatedAt: NOW,
    });
    const prisma = {
      question: {
        findUnique: vi.fn(async (_args: unknown) => current()),
        findUniqueOrThrow: vi.fn(async (_args: unknown) => current()),
        update: vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({
          ...current(),
          ...data,
        })),
        updateMany: vi.fn(async ({ data }: { data: { status: typeof status } }) => {
          if (row.status !== "pending") return { count: 0 };
          row.status = data.status;
          return { count: 1 };
        }),
      },
      anchor: { update: vi.fn(async (_args: unknown) => ({})) },
      reviewItem: { create: vi.fn(async (_args: { data: Record<string, unknown> }) => ({})) },
      auditLog: { create: vi.fn(async (_args: unknown) => ({})) },
    };
    Object.assign(prisma, {
      $transaction: vi.fn(async (cb: (tx: unknown) => Promise<unknown>) => cb(prisma)),
    });
    const service = new QuestionsService(prisma as unknown as PrismaService, new PolicyService());
    return { service, prisma };
  }

  it("two concurrent approvals create a single review item", async () => {
    const { service, prisma } = setup("pending");

    await Promise.all([service.approve("user-a", "q-1"), service.approve("user-a", "q-1")]);

    expect(prisma.reviewItem.create).toHaveBeenCalledTimes(1);
  });

  it("approving a pending suggestion puts it in the review", async () => {
    const { service, prisma } = setup("pending");

    const question = await service.approve("user-a", "q-1");

    expect(question.status).toBe("approved");
    expect(prisma.reviewItem.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ userId: "user-a", kind: "question", refId: "q-1" }),
    });
  });

  it("approving twice does not create a second review item", async () => {
    const { service, prisma } = setup("approved");

    await expect(service.approve("user-a", "q-1")).resolves.toMatchObject({ status: "approved" });
    expect(prisma.reviewItem.create).not.toHaveBeenCalled();
  });

  it("discarding hides the suggestion and its anchor, without a review item", async () => {
    const { service, prisma } = setup("pending");

    await service.discard("user-a", "q-1");

    expect(prisma.question.update).toHaveBeenCalledWith({
      where: { id: "q-1" },
      data: { status: "discarded", deletedAt: expect.any(Date) },
    });
    expect(prisma.anchor.update).toHaveBeenCalled();
    expect(prisma.reviewItem.create).not.toHaveBeenCalled();
  });

  it("an approved question can't be discarded (it is deleted instead)", async () => {
    const { service } = setup("approved");
    await expect(service.discard("user-a", "q-1")).rejects.toBeInstanceOf(ConflictException);
  });

  it("user B can neither approve nor discard user A's suggestion", async () => {
    const { service, prisma } = setup("pending", "user-a");

    await expect(service.approve("user-b", "q-1")).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.discard("user-b", "q-1")).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.question.update).not.toHaveBeenCalled();
  });
});
