import { NotFoundException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import type { AiService } from "../ai/ai.service";
import { AiUnavailableException } from "../ai/ai-errors";
import type { PrismaService } from "../prisma/prisma.service";
import { QuestionAiService } from "./question-ai.service";

const Q1 = { id: "q1", text: "Por que o TCP faz handshake?", answer: "Pra combinar a sequência." };
const Q2 = { id: "q2", text: "O que o UDP não garante?", answer: "Entrega e ordem." };

function setup(rows: Array<typeof Q1> = [Q1, Q2]) {
  const prisma = {
    question: {
      findMany: vi.fn(async (_args: unknown) => rows),
      findFirst: vi.fn(async (_args: unknown) => ({
        text: Q1.text,
        answer: Q1.answer,
        anchor: { quote: "handshake", prefix: "o TCP faz ", suffix: " antes", deletedAt: null },
      })),
    },
  };
  const ai = {
    completeJson: vi.fn(async (..._args: unknown[]) => ({
      provider: "local",
      data: {
        results: [
          { id: "r2", verdict: "partial", missing: ["  ordem  ", "", "x".repeat(300)] },
          { id: "r1", verdict: "right", missing: [] },
        ],
      },
    })),
    completeText: vi.fn(async (..._args: unknown[]) => ({
      provider: "local",
      data: "Você acertou que abre a conexão.",
    })),
  };
  const service = new QuestionAiService(
    prisma as unknown as PrismaService,
    ai as unknown as AiService,
  );
  return { service, prisma, ai };
}

const ITEMS = {
  items: [
    { questionId: "q1", answer: "Pra abrir a conexão." },
    { questionId: "q2", answer: "Entrega." },
  ],
};

describe("QuestionAiService.grade", () => {
  it("grades every answer in one AI call and maps results back in order", async () => {
    const { service, ai } = setup();

    const { results } = await service.grade("user-a", ITEMS);

    expect(ai.completeJson).toHaveBeenCalledTimes(1);
    expect(ai.completeJson.mock.calls[0]![1]).toBe("grade-answer");
    expect(results).toEqual([
      { questionId: "q1", verdict: "right", missing: [] },
      { questionId: "q2", verdict: "partial", missing: ["ordem", "x".repeat(200)] },
    ]);
  });

  it("only reads approved questions of the person's own notes", async () => {
    const { service, prisma } = setup();

    await service.grade("user-a", ITEMS);

    expect(prisma.question.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: { in: ["q1", "q2"] },
          deletedAt: null,
          status: "approved",
          note: { authorId: "user-a", deletedAt: null },
        },
      }),
    );
  });

  it("answers 404 without calling the AI when any question is not the person's or not approved", async () => {
    const { service, ai } = setup([Q1]);

    await expect(service.grade("user-b", ITEMS)).rejects.toBeInstanceOf(NotFoundException);
    expect(ai.completeJson).not.toHaveBeenCalled();
  });

  it("sends short ids to the model, never the database ids", async () => {
    const { service, ai } = setup();

    await service.grade("user-a", ITEMS);

    const prompt = JSON.stringify(ai.completeJson.mock.calls[0]![2]);
    expect(prompt).toContain('"id":"r1"');
    expect(prompt).not.toContain('"id":"q1"');
  });
});

describe("QuestionAiService.explain", () => {
  it("explains using the attempt and the note excerpt", async () => {
    const { service, ai } = setup();

    const result = await service.explain("user-a", "q1", { answer: "Pra abrir a conexão." });

    expect(result).toEqual({ explanation: "Você acertou que abre a conexão." });
    const prompt = JSON.stringify(ai.completeText.mock.calls[0]![2]);
    expect(prompt).toContain("Pra abrir a conexão.");
    expect(prompt).toContain("o TCP faz handshake antes");
  });

  it("answers 404 without calling the AI for a question that is not studyable", async () => {
    const { service, prisma, ai } = setup();
    prisma.question.findFirst.mockResolvedValueOnce(null as never);

    await expect(service.explain("user-b", "q1", { answer: "x" })).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(ai.completeText).not.toHaveBeenCalled();
    expect(prisma.question.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: "q1",
          status: "approved",
          note: { authorId: "user-b", deletedAt: null },
        }),
      }),
    );
  });

  it("caps a long explanation", async () => {
    const { service, ai } = setup();
    ai.completeText.mockResolvedValueOnce({ provider: "groq", data: "a".repeat(5000) });

    const { explanation } = await service.explain("user-a", "q1", { answer: "x" });

    expect(explanation).toHaveLength(1200);
  });

  it("lets ai_unavailable through so the front offers the ready prompt", async () => {
    const { service, ai } = setup();
    ai.completeText.mockRejectedValueOnce(new AiUnavailableException("feature_disabled"));

    await expect(service.explain("user-a", "q1", { answer: "x" })).rejects.toBeInstanceOf(
      AiUnavailableException,
    );
  });
});
