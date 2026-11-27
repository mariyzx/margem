import type { StudioSourceDto } from "@margem/shared";
import { describe, expect, it } from "vitest";
import { messages } from "../../messages/pt-br";
import { masteryLevel, weakestSource } from "./studio-rules";

function source(id: string, mastery: number | null, status: StudioSourceDto["status"] = "ready") {
  return {
    id,
    title: id,
    type: "file",
    status,
    createdAt: "2026-11-27T12:00:00.000Z",
    reviewItems: mastery === null ? 0 : 4,
    mastered: 0,
    mastery,
    decks: [],
  } satisfies StudioSourceDto;
}

describe("weakestSource", () => {
  it("picks the first ready source that has a mastery value", () => {
    expect(weakestSource([source("lendo", 0, "processing"), source("fraca", 20)])?.id).toBe(
      "fraca",
    );
  });

  it("has nothing to study when no source has practice yet", () => {
    expect(weakestSource([source("nova", null)])).toBeNull();
  });
});

describe("masteryLevel", () => {
  it.each([
    [null, "none"],
    [0, "weak"],
    [39, "weak"],
    [40, "growing"],
    [69, "growing"],
    [70, "strong"],
  ] as const)("reads %s as %s", (value, level) => {
    expect(masteryLevel(value)).toBe(level);
  });
});

describe("studio messages", () => {
  it("counts sources and deck items in Portuguese", () => {
    expect(messages.studio.overviewSubtitle(1)).toBe(
      "1 fonte. O que está mais fraco aparece primeiro.",
    );
    expect(messages.studio.decks.quiz.unit(1)).toBe("1 pergunta");
    expect(messages.studio.decks.cloze.unit(6)).toBe("6 trechos");
  });
});
