import {
  explainAnswerSchema,
  extractNoteBlocks,
  gradeAnswersSchema,
  resolveAnchorInDoc,
} from "./questions";
import { describe, expect, it } from "vitest";

describe("resolveAnchorInDoc", () => {
  const doc = {
    type: "doc",
    content: [
      {
        type: "paragraph",
        attrs: { blockId: "b1" },
        content: [{ type: "text", text: "TCP garante entrega ordenada dos pacotes na rede." }],
      },
    ],
  };

  it("finds quote inside original block", () => {
    const res = resolveAnchorInDoc(doc, {
      blockId: "b1",
      quote: "entrega ordenada",
      prefix: "TCP garante ",
      suffix: " dos pacotes",
    });
    expect(res).toEqual({ found: true, blockId: "b1" });
  });

  it("returns found: false when quote was removed", () => {
    const res = resolveAnchorInDoc(doc, {
      blockId: "b1",
      quote: "trecho apagado",
      prefix: "",
      suffix: "",
    });
    expect(res.found).toBe(false);
  });
});

describe("extractNoteBlocks", () => {
  it("returns top-level blocks with an id and some text, nested text joined", () => {
    const doc = {
      type: "doc",
      content: [
        { type: "paragraph", attrs: { blockId: "b1" }, content: [{ type: "text", text: "TCP" }] },
        { type: "paragraph", attrs: { blockId: "b2" }, content: [] },
        { type: "paragraph", content: [{ type: "text", text: "sem id" }] },
        {
          type: "bulletList",
          attrs: { blockId: "b3" },
          content: [
            { type: "listItem", content: [{ type: "text", text: "um " }] },
            { type: "listItem", content: [{ type: "text", text: "dois" }] },
          ],
        },
      ],
    };
    expect(extractNoteBlocks(doc)).toEqual([
      { blockId: "b1", text: "TCP" },
      { blockId: "b3", text: "um dois" },
    ]);
  });
});

describe("gradeAnswersSchema", () => {
  it("accepts 1 to 20 written answers and trims them", () => {
    expect(
      gradeAnswersSchema.parse({ items: [{ questionId: "q1", answer: "  porque sim  " }] }),
    ).toEqual({ items: [{ questionId: "q1", answer: "porque sim" }] });
  });

  it.each([
    { items: [] },
    { items: [{ questionId: "q1", answer: "   " }] },
    {
      items: [
        { questionId: "q1", answer: "a" },
        { questionId: "q1", answer: "b" },
      ],
    },
    { items: Array.from({ length: 21 }, (_, i) => ({ questionId: `q${i}`, answer: "a" })) },
  ])("rejects %j", (body) => {
    expect(gradeAnswersSchema.safeParse(body).success).toBe(false);
  });
});

describe("explainAnswerSchema", () => {
  it("requires the person's attempt", () => {
    expect(explainAnswerSchema.safeParse({}).success).toBe(false);
    expect(explainAnswerSchema.safeParse({ answer: " " }).success).toBe(false);
    expect(explainAnswerSchema.safeParse({ answer: "TCP confirma" }).success).toBe(true);
  });
});
