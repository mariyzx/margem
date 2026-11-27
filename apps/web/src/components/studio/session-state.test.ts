import type { SessionActivityDto } from "@margem/shared";
import { describe, expect, it } from "vitest";
import { messages } from "../../messages/pt-br";
import {
  initialSessionState,
  kindCounts,
  outcomeCounts,
  planKey,
  remainingMinutes,
  sessionReducer,
  sessionStarted,
} from "./session-state";

function activity(id: string, kind: SessionActivityDto["kind"]): SessionActivityDto {
  return {
    reviewItemId: id,
    practiceId: `p-${id}`,
    kind,
    prompt: `${id}?`,
    answer: `${id}.`,
    sourceId: "s1",
    sourceTitle: "Filas",
    excerpt: { text: "Trecho", page: 1 },
  };
}

const planned = sessionReducer(
  sessionReducer(initialSessionState, { type: "configure", sourceIds: ["s1"], minutes: 10 }),
  {
    type: "planned",
    plan: {
      key: planKey(["s1"], 10),
      activities: [activity("r1", "quiz"), activity("r2", "cloze"), activity("r3", "why")],
    },
  },
);

describe("sessionReducer", () => {
  it("ignores a rating before the excerpt is shown", () => {
    expect(sessionReducer(planned, { type: "rated", rating: "easy" })).toBe(planned);
  });

  it("records the rating and moves on with a clean answer", () => {
    const typed = sessionReducer(planned, { type: "typeAnswer", value: "minha resposta" });
    const shown = sessionReducer(typed, { type: "reveal" });
    const next = sessionReducer(shown, { type: "rated", rating: "again" });
    expect(next).toMatchObject({
      index: 1,
      answer: "",
      revealed: false,
      outcomes: { r1: "again" },
    });
  });

  it("skips without needing to check", () => {
    expect(sessionReducer(planned, { type: "skip" }).outcomes).toEqual({ r1: "skipped" });
  });

  it("locks the answer once the excerpt is shown", () => {
    const shown = sessionReducer(planned, { type: "reveal" });
    expect(sessionReducer(shown, { type: "typeAnswer", value: "mudei" }).answer).toBe("");
  });

  it("starts over when configured from the overview", () => {
    const started = sessionReducer(planned, { type: "skip" });
    expect(sessionStarted(started)).toBe(true);
    const fresh = sessionReducer(started, { type: "configure", sourceIds: ["s2"] });
    expect(fresh).toMatchObject({ sourceIds: ["s2"], minutes: 10, plan: null, index: 0 });
  });

  it("toggles sources in and out", () => {
    const added = sessionReducer(planned, { type: "toggleSource", sourceId: "s2" });
    expect(added.sourceIds).toEqual(["s1", "s2"]);
    expect(sessionReducer(added, { type: "toggleSource", sourceId: "s1" }).sourceIds).toEqual([
      "s2",
    ]);
  });
});

describe("session helpers", () => {
  it("keys the plan by sources and time, in any order", () => {
    expect(planKey(["b", "a"], 20)).toBe(planKey(["a", "b"], 20));
    expect(planKey(["a"], 20)).not.toBe(planKey(["a"], 40));
  });

  it("counts kinds, outcomes and the time left", () => {
    expect(kindCounts(planned.plan!.activities)).toEqual({ cloze: 1, quiz: 1, why: 1 });
    expect(outcomeCounts({ a: "again", b: "easy", c: "skipped" })).toEqual({
      again: 1,
      hard: 0,
      easy: 1,
      skipped: 1,
    });
    expect(remainingMinutes(planned)).toBe(4);
    expect(remainingMinutes(sessionReducer(planned, { type: "skip" }))).toBe(3);
    const long = {
      ...planned,
      plan: {
        key: "k",
        activities: Array.from({ length: 32 }, (_, i) => activity(`r${i}`, "quiz")),
      },
    };
    expect(remainingMinutes(long)).toBe(10);
  });

  it("describes the mix in Portuguese", () => {
    expect(messages.studio.session.mix({ cloze: 4, quiz: 3, why: 2 })).toBe(
      "4 lacunas, 3 perguntas e 2 de “por quê?”",
    );
    expect(messages.studio.session.mix({ cloze: 0, quiz: 1, why: 0 })).toBe("1 pergunta");
  });
});
