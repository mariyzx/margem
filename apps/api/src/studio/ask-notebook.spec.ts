import { NotFoundException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import type { AiService } from "../ai/ai.service";
import { AiUnavailableException } from "../ai/ai-errors";
import type { PrismaService } from "../prisma/prisma.service";
import type { NotebookContext, NotebookContextService } from "../search/notebook-context.service";
import { AskNotebookService } from "./ask-notebook.service";

const CONTEXT: NotebookContext = {
  retrieval: "hybrid",
  chunks: [
    {
      id: "chunk-1",
      sourceId: "s1",
      title: "Redes",
      page: 3,
      text: "O TCP usa janela deslizante.",
    },
  ],
  noteBlocks: [{ noteId: "note-1", blockId: "b2", title: "Aula 1", text: "Janela = fluxo." }],
};

function setup(
  opts: { context?: NotebookContext; output?: unknown; aiError?: Error; disabled?: boolean } = {},
) {
  const prisma = {
    notebook: {
      findFirst: vi.fn(async (args: { where: { ownerId: string } }) =>
        args.where.ownerId === "user-a" ? { id: "nb1" } : null,
      ),
    },
  };
  const context = { gather: vi.fn(async (_query: unknown) => opts.context ?? CONTEXT) };
  const ai = {
    assertEnabled: vi.fn(async (..._args: unknown[]) => {
      if (opts.disabled) throw new AiUnavailableException("feature_disabled");
    }),
    completeJson: vi.fn(async (..._args: unknown[]) => {
      if (opts.aiError) throw opts.aiError;
      return {
        provider: "groq",
        data: opts.output ?? { answer: "Controla o fluxo.", citations: ["t1", "n1", "t7"] },
      };
    }),
  };
  const service = new AskNotebookService(
    prisma as unknown as PrismaService,
    ai as unknown as AiService,
    context as unknown as NotebookContextService,
  );
  return { service, ai, context };
}

describe("AskNotebookService", () => {
  it("answers with the citations that were in the context", async () => {
    const { service, ai, context } = setup();
    const result = await service.ask("user-a", "nb1", {
      question: "Para que serve a janela?",
      sourceIds: ["s1"],
    });

    expect(context.gather).toHaveBeenCalledWith({
      userId: "user-a",
      notebookId: "nb1",
      question: "Para que serve a janela?",
      sourceIds: ["s1"],
    });
    expect(ai.completeJson.mock.calls[0]![1]).toBe("ask-notebook");
    expect(result).toEqual({
      found: true,
      answer: "Controla o fluxo.",
      citations: [
        {
          kind: "chunk",
          id: "chunk-1",
          title: "Redes",
          excerpt: "O TCP usa janela deslizante.",
          sourceId: "s1",
          noteId: null,
          blockId: null,
          page: 3,
        },
        {
          kind: "note",
          id: "note-1:b2",
          title: "Aula 1",
          excerpt: "Janela = fluxo.",
          sourceId: null,
          noteId: "note-1",
          blockId: "b2",
          page: null,
        },
      ],
    });
  });

  it("says it did not find anything when the model cites nothing it was given", async () => {
    const { service } = setup({ output: { answer: "Resposta da cabeça.", citations: ["t9"] } });
    expect(await service.ask("user-a", "nb1", { question: "O que é TCP?" })).toEqual({
      found: false,
      answer: null,
      citations: [],
    });
  });

  it("does not call the AI without context", async () => {
    const { service, ai } = setup({
      context: { retrieval: "postgres", chunks: [], noteBlocks: [] },
    });
    const result = await service.ask("user-a", "nb1", { question: "O que é TCP?" });

    expect(result.found).toBe(false);
    expect(ai.completeJson).not.toHaveBeenCalled();
  });

  it("returns 404 for another person's notebook without searching", async () => {
    const { service, ai, context } = setup();
    await expect(service.ask("user-b", "nb1", { question: "O que é TCP?" })).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(context.gather).not.toHaveBeenCalled();
    expect(ai.completeJson).not.toHaveBeenCalled();
  });

  it("lets ai_unavailable through so the screen offers the ready-made prompt", async () => {
    const { service } = setup({ aiError: new AiUnavailableException("feature_disabled") });
    await expect(service.ask("user-a", "nb1", { question: "O que é TCP?" })).rejects.toBeInstanceOf(
      AiUnavailableException,
    );
  });

  it("does not search when asking the notebook is turned off", async () => {
    const { service, ai, context } = setup({ disabled: true });
    await expect(service.ask("user-a", "nb1", { question: "O que é TCP?" })).rejects.toBeInstanceOf(
      AiUnavailableException,
    );
    expect(context.gather).not.toHaveBeenCalled();
    expect(ai.completeJson).not.toHaveBeenCalled();
  });
});
