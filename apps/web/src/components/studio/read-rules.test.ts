import type { AskCitationDto, PracticeItemDto } from "@margem/shared";
import { describe, expect, it } from "vitest";
import { answerChunkId, practiceByChunk, splitBlanks } from "./read-rules";
import { initialReadState, readReducer } from "./read-state";

function practice(id: string, kind: PracticeItemDto["kind"], chunk: string | null) {
  return {
    id,
    notebookId: "nb1",
    sourceId: "s1",
    sourceChunkId: chunk,
    kind,
    prompt: `${id}?`,
    answer: `${id}.`,
    createdBy: "ai",
    status: "approved",
    createdAt: "2026-11-27T12:00:00.000Z",
    updatedAt: "2026-11-27T12:00:00.000Z",
  } satisfies PracticeItemDto;
}

function citation(kind: AskCitationDto["kind"], id: string): AskCitationDto {
  return {
    kind,
    id,
    title: "Aula",
    excerpt: "…",
    sourceId: null,
    noteId: null,
    blockId: null,
    page: null,
  };
}

describe("practiceByChunk", () => {
  it("groups the chosen kind by chunk and keeps the rest aside", () => {
    const result = practiceByChunk(
      [
        practice("p1", "quiz", "c1"),
        practice("p2", "quiz", "c1"),
        practice("p3", "flashcard", "c1"),
        practice("p4", "quiz", "c9"),
        practice("p5", "quiz", null),
      ],
      "quiz",
      new Set(["c1", "c2"]),
    );
    expect(result.byChunk.get("c1")?.map((item) => item.id)).toEqual(["p1", "p2"]);
    expect(result.unplaced.map((item) => item.id)).toEqual(["p4", "p5"]);
  });
});

describe("splitBlanks", () => {
  it("hides each answer where it first appears, in reading order", () => {
    expect(
      splitBlanks("A fila desacopla o produtor; o ack volta pra fila.", [
        { id: "b2", answer: "ack" },
        { id: "b1", answer: "desacopla" },
      ]),
    ).toEqual([
      { text: "A fila " },
      { text: "desacopla", blankId: "b1" },
      { text: " o produtor; o " },
      { text: "ack", blankId: "b2" },
      { text: " volta pra fila." },
    ]);
  });

  it("skips overlaps and answers that are not in the text", () => {
    expect(
      splitBlanks("fila de mensagens", [
        { id: "b1", answer: "fila de" },
        { id: "b2", answer: "de mensagens" },
        { id: "b3", answer: "ausente" },
      ]),
    ).toEqual([{ text: "fila de", blankId: "b1" }, { text: " mensagens" }]);
  });

  it("uses a later occurrence when the first one overlaps", () => {
    expect(
      splitBlanks("fila fila", [
        { id: "b1", answer: "fila" },
        { id: "b2", answer: "fila" },
      ]),
    ).toEqual([{ text: "fila", blankId: "b1" }, { text: " " }, { text: "fila", blankId: "b2" }]);
  });
});

describe("answerChunkId", () => {
  it("places the answer next to the first cited chunk of this sheet", () => {
    const asked = {
      found: true,
      answer: "Volta pra fila.",
      citations: [citation("note", "n1:b1"), citation("chunk", "c9"), citation("chunk", "c2")],
    };
    expect(answerChunkId(asked, new Set(["c1", "c2"]))).toBe("c2");
    expect(answerChunkId(asked, new Set(["c1"]))).toBeNull();
    expect(answerChunkId({ found: false, answer: null, citations: [] }, new Set())).toBeNull();
  });
});

describe("readReducer", () => {
  it("only accepts a rating after the answer was shown", () => {
    const rated = readReducer(initialReadState, {
      type: "rate",
      practiceId: "p1",
      result: "right",
    });
    expect(rated.results).toEqual({});
    const shown = readReducer(initialReadState, { type: "reveal", practiceId: "p1" });
    expect(readReducer(shown, { type: "rate", practiceId: "p1", result: "wrong" }).results).toEqual(
      { p1: "wrong" },
    );
  });

  it("flips a card back and forth", () => {
    const once = readReducer(initialReadState, { type: "flip", practiceId: "p1" });
    expect(readReducer(once, { type: "flip", practiceId: "p1" }).flipped.p1).toBe(false);
  });
});
