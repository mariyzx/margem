import type { AskCitationDto } from "@margem/shared";
import { describe, expect, it } from "vitest";
import { MAX_ASK_ANSWER_CHARS } from "../ai/prompts/ask-notebook";
import { groundAnswer, notFound } from "./ground-answer";

function citation(id: string): AskCitationDto {
  return {
    kind: "chunk",
    id,
    title: "Redes",
    excerpt: "O TCP usa janela deslizante.",
    sourceId: "s1",
    noteId: null,
    blockId: null,
    page: 1,
  };
}

const BY_ID = new Map([
  ["t1", citation("chunk-1")],
  ["t2", citation("chunk-2")],
]);

describe("groundAnswer", () => {
  it("keeps only cited ids that were sent, once each", () => {
    const result = groundAnswer(
      { answer: " Controle de fluxo. ", citations: ["t1", " t1", "t9", "t2"] },
      BY_ID,
    );
    expect(result).toEqual({
      found: true,
      answer: "Controle de fluxo.",
      citations: [citation("chunk-1"), citation("chunk-2")],
    });
  });

  it("answers not found without a valid citation or without text", () => {
    expect(groundAnswer({ answer: "Inventado.", citations: ["t9"] }, BY_ID)).toEqual(notFound());
    expect(groundAnswer({ answer: "Sem prova.", citations: [] }, BY_ID)).toEqual(notFound());
    expect(groundAnswer({ answer: "   ", citations: ["t1"] }, BY_ID)).toEqual(notFound());
  });

  it("clips a long answer", () => {
    const result = groundAnswer(
      { answer: "a".repeat(MAX_ASK_ANSWER_CHARS + 50), citations: ["t1"] },
      BY_ID,
    );
    expect(result.answer).toHaveLength(MAX_ASK_ANSWER_CHARS);
    expect(result.answer!.endsWith("…")).toBe(true);
  });
});
