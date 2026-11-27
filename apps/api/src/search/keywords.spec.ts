import { describe, expect, it } from "vitest";
import { extractKeywords, keywordScore } from "./keywords";

describe("extractKeywords", () => {
  it("drops stopwords, short words and repeats, keeping accents", () => {
    expect(extractKeywords("Como o TCP faz o controle de fluxo? E o fluxo na revisão?")).toEqual([
      "tcp",
      "faz",
      "controle",
      "fluxo",
      "revisão",
    ]);
  });

  it("caps the number of terms", () => {
    expect(extractKeywords("alfa beta gama delta épsilon zeta eta teta iota kappa")).toHaveLength(
      8,
    );
  });

  it("counts how many terms appear in a text", () => {
    expect(keywordScore("O TCP faz controle de fluxo", ["tcp", "fluxo", "udp"])).toBe(2);
  });
});
