import { describe, expect, it } from "vitest";
import { extractMemoryParagraphs } from "./sources";

describe("extractMemoryParagraphs", () => {
  it("extracts only memory blocks and ignores material blocks", () => {
    const doc = {
      type: "doc",
      content: [
        {
          type: "paragraph",
          attrs: { origin: "memory" },
          content: [{ type: "text", text: "Eleição de líder no Raft" }],
        },
        {
          type: "paragraph",
          attrs: { origin: "material" },
          content: [{ type: "text", text: "Log replication" }],
        },
        { type: "paragraph", content: [{ type: "text", text: "ok" }] },
      ],
    };
    expect(extractMemoryParagraphs(doc)).toEqual(["Eleição de líder no Raft"]);
  });

  it("reads anything that is not a document as empty", () => {
    expect(extractMemoryParagraphs(null)).toEqual([]);
    expect(extractMemoryParagraphs({ content: "x" })).toEqual([]);
  });
});
