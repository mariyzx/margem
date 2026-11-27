import { describe, expect, it } from "vitest";
import { groundPractice } from "./ground-practice";

const CHUNKS = new Map([
  ["c1", { chunkId: "chunk-1", text: "O TCP usa janela deslizante para controle de fluxo." }],
  ["c2", { chunkId: "chunk-2", text: "O UDP não garante entrega nem ordem." }],
]);
const ALL = ["quiz", "flashcard", "cloze", "why"] as const;

function item(
  partial: Partial<{ kind: string; prompt: string; answer: string; sourceChunkId: string }>,
) {
  return {
    kind: "quiz",
    prompt: "Para que serve a janela deslizante?",
    answer: "Controle de fluxo.",
    sourceChunkId: "c1",
    ...partial,
  } as { kind: (typeof ALL)[number]; prompt: string; answer: string; sourceChunkId: string };
}

describe("groundPractice", () => {
  it("keeps items tied to a sent excerpt and maps them to the real chunk id", () => {
    expect(groundPractice({ items: [item({})] }, CHUNKS, [...ALL])).toEqual([
      {
        kind: "quiz",
        prompt: "Para que serve a janela deslizante?",
        answer: "Controle de fluxo.",
        sourceChunkId: "chunk-1",
      },
    ]);
  });

  it("drops invented excerpts, kinds not asked for, empty fields and duplicates", () => {
    const items = [
      item({ sourceChunkId: "c9" }),
      item({ kind: "why" }),
      item({ prompt: "  " }),
      item({}),
      item({ prompt: "para que serve a  janela deslizante?" }),
    ];
    expect(groundPractice({ items }, CHUNKS, ["quiz"])).toHaveLength(1);
  });

  it("requires a blank in the cloze and an answer copied from the excerpt", () => {
    const ok = item({
      kind: "cloze",
      prompt: "O UDP não garante ____ nem ordem.",
      answer: "entrega",
      sourceChunkId: "c2",
    });
    const noBlank = item({
      kind: "cloze",
      prompt: "O UDP não garante entrega.",
      answer: "entrega",
      sourceChunkId: "c2",
    });
    const invented = item({
      kind: "cloze",
      prompt: "O UDP é ____.",
      answer: "rápido",
      sourceChunkId: "c2",
    });

    expect(groundPractice({ items: [ok, noBlank, invented] }, CHUNKS, [...ALL])).toEqual([
      {
        kind: "cloze",
        prompt: "O UDP não garante ____ nem ordem.",
        answer: "entrega",
        sourceChunkId: "chunk-2",
      },
    ]);
  });

  it("drops a question that gives away its own answer", () => {
    const leaky = item({
      prompt: "O controle de fluxo. Para que serve a janela?",
      answer: "controle de fluxo.",
    });
    expect(groundPractice({ items: [leaky] }, CHUNKS, [...ALL])).toEqual([]);
  });

  it("caps how many come back", () => {
    const items = Array.from({ length: 20 }, (_, i) => item({ prompt: `Pergunta ${i}?` }));
    expect(groundPractice({ items }, CHUNKS, [...ALL])).toHaveLength(8);
  });
});
