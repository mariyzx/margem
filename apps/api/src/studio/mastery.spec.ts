import { describe, expect, it } from "vitest";
import { byWeakestFirst, masteryOf } from "./mastery";

describe("masteryOf", () => {
  it("counts only items whose last rating was hard or easy", () => {
    expect(masteryOf(["easy", "hard", "again", undefined])).toEqual({
      reviewItems: 4,
      mastered: 2,
      mastery: 50,
    });
  });

  it("has no percentage without items", () => {
    expect(masteryOf([])).toEqual({ reviewItems: 0, mastered: 0, mastery: null });
  });

  it("rounds to a whole percent", () => {
    expect(masteryOf(["easy", undefined, undefined]).mastery).toBe(33);
  });
});

describe("byWeakestFirst", () => {
  it("puts the weakest first and sources without items last", () => {
    const sources = [
      { title: "Sem itens", mastery: null },
      { title: "Forte", mastery: 80 },
      { title: "Fraca B", mastery: 20 },
      { title: "Fraca A", mastery: 20 },
    ];
    expect(sources.sort(byWeakestFirst).map((source) => source.title)).toEqual([
      "Fraca A",
      "Fraca B",
      "Forte",
      "Sem itens",
    ]);
  });
});
