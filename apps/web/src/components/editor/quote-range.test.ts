import { getSchema } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import { describe, expect, it } from "vitest";
import { BlockId } from "./block-id";
import { Cloze } from "./cloze-mark";
import { findQuoteRange } from "./quote-range";

const schema = getSchema([StarterKit, Cloze, BlockId]);

const doc = schema.nodeFromJSON({
  type: "doc",
  content: [
    {
      type: "paragraph",
      attrs: { blockId: "b1" },
      content: [{ type: "text", text: "O UDP não garante entrega." }],
    },
    {
      type: "paragraph",
      attrs: { blockId: "b2" },
      content: [
        { type: "text", text: "O TCP faz o " },
        { type: "text", text: "three-way", marks: [{ type: "bold" }] },
        { type: "text", text: " handshake antes de enviar." },
      ],
    },
    {
      type: "bulletList",
      attrs: { blockId: "b3" },
      content: [
        {
          type: "listItem",
          content: [{ type: "paragraph", content: [{ type: "text", text: "janela " }] }],
        },
        {
          type: "listItem",
          content: [{ type: "paragraph", content: [{ type: "text", text: "deslizante" }] }],
        },
      ],
    },
  ],
});

function textAt(range: { from: number; to: number } | null) {
  return range ? doc.textBetween(range.from, range.to) : null;
}

describe("findQuoteRange", () => {
  it("finds a quote inside the right block", () => {
    expect(textAt(findQuoteRange(doc, "b1", "não garante"))).toBe("não garante");
  });

  it("crosses formatting marks inside the block", () => {
    expect(textAt(findQuoteRange(doc, "b2", "three-way handshake"))).toBe("three-way handshake");
  });

  it("searches top-level blocks like the API does, across list items", () => {
    expect(textAt(findQuoteRange(doc, "b3", "janela deslizante"))).toBe("janela deslizante");
  });

  it("returns null when the text is not in that block anymore", () => {
    expect(findQuoteRange(doc, "b1", "three-way")).toBeNull();
    expect(findQuoteRange(doc, "b9", "UDP")).toBeNull();
    expect(findQuoteRange(doc, "b1", "   ")).toBeNull();
  });
});
