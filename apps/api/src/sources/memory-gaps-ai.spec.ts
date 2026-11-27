import { NotFoundException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import type { AiService } from "../ai/ai.service";
import { AiUnavailableException } from "../ai/ai-errors";
import { PolicyService } from "../policies/policy.service";
import type { PrismaService } from "../prisma/prisma.service";
import { MemoryGapsAiService } from "./memory-gaps-ai.service";

const MEMORY_DOC = {
  type: "doc",
  content: [
    {
      type: "paragraph",
      attrs: { blockId: "b1", origin: "memory" },
      content: [{ type: "text", text: "TCP é confiável e faz handshake." }],
    },
    {
      type: "paragraph",
      attrs: { blockId: "b2", origin: "material" },
      content: [{ type: "text", text: "Copiado do material depois de abrir." }],
    },
  ],
};

const CHUNKS = [
  { id: "chunk-a", ord: 0, page: 1, text: "O TCP faz handshake de três vias." },
  { id: "chunk-b", ord: 1, page: 2, text: "O TCP usa janela deslizante para controle de fluxo." },
];

function setup(opts: { doc?: unknown; source?: unknown } = {}) {
  const prisma = {
    note: {
      findUnique: vi.fn(async (_args: unknown) => ({
        authorId: "user-a",
        deletedAt: null,
        doc: opts.doc ?? MEMORY_DOC,
        sourceId: "src-1",
        source: opts.source === undefined ? { deletedAt: null, status: "ready" } : opts.source,
      })),
    },
    sourceChunk: { findMany: vi.fn(async (_args: unknown) => CHUNKS) },
  };
  const ai = {
    completeJson: vi.fn(async (..._args: unknown[]) => ({
      provider: "groq",
      data: {
        gaps: [
          { point: "  Faltou: controle de fluxo com janela deslizante.  ", sourceChunkId: "c2" },
          { point: "Faltou: controle de fluxo com janela deslizante.", sourceChunkId: "c2" },
          { point: "   ", sourceChunkId: "c1" },
          { point: "Faltou: algo inventado.", sourceChunkId: "c9" },
        ],
      },
    })),
  };
  const service = new MemoryGapsAiService(
    prisma as unknown as PrismaService,
    new PolicyService(),
    ai as unknown as AiService,
  );
  return { service, prisma, ai };
}

describe("MemoryGapsAiService", () => {
  it("lists what is missing tied to its excerpt, dropping only invented or empty points", async () => {
    const { service } = setup();

    const result = await service.check("user-a", "note-1");

    expect(result).toEqual({
      hasMemoryText: true,
      gaps: [
        {
          point: "Faltou: controle de fluxo com janela deslizante.",
          chunkId: "chunk-b",
          ord: 1,
          page: 2,
          excerpt: "O TCP usa janela deslizante para controle de fluxo.",
        },
      ],
    });
  });

  it("sends only what was written from memory, with short chunk ids", async () => {
    const { service, ai } = setup();

    await service.check("user-a", "note-1");

    const [, feature, prompt] = ai.completeJson.mock.calls[0]!;
    expect(feature).toBe("memory-gaps");
    const sent = JSON.stringify(prompt);
    expect(sent).toContain("TCP é confiável e faz handshake.");
    expect(sent).not.toContain("Copiado do material");
    expect(sent).toContain('"id":"c1"');
    expect(sent).not.toContain("chunk-a");
  });

  it("does not call the AI before the person wrote from memory", async () => {
    const { service, ai } = setup({
      doc: { type: "doc", content: [MEMORY_DOC.content[1]] },
    });

    await expect(service.check("user-a", "note-1")).resolves.toEqual({
      gaps: [],
      hasMemoryText: false,
    });
    expect(ai.completeJson).not.toHaveBeenCalled();
  });

  it.each([
    null,
    { deletedAt: new Date(), status: "ready" },
    { deletedAt: null, status: "processing" },
  ])("does not call the AI without a ready source (%j)", async (source) => {
    const { service, ai } = setup({ source });

    await expect(service.check("user-a", "note-1")).resolves.toEqual({
      gaps: [],
      hasMemoryText: true,
    });
    expect(ai.completeJson).not.toHaveBeenCalled();
  });

  it("answers 404 for someone else's note without calling the AI", async () => {
    const { service, ai } = setup();

    await expect(service.check("user-b", "note-1")).rejects.toBeInstanceOf(NotFoundException);
    expect(ai.completeJson).not.toHaveBeenCalled();
  });

  it("lets ai_unavailable through so the front falls back to the version without AI", async () => {
    const { service, ai } = setup();
    ai.completeJson.mockRejectedValueOnce(new AiUnavailableException("quota"));

    await expect(service.check("user-a", "note-1")).rejects.toBeInstanceOf(AiUnavailableException);
  });
});
