import { resolveAnchorInDoc } from "@margem/shared";
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
