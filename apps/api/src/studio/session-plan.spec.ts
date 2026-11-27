import { describe, expect, it } from "vitest";
import { planSession, priorityTier, type SessionCandidate } from "./session-plan";

const NOW = new Date("2026-11-27T12:00:00Z");
const PAST = new Date("2026-11-26T12:00:00Z");
const FUTURE = new Date("2026-12-05T12:00:00Z");

function candidate(
  id: string,
  kind: string,
  sourceId: string,
  lastRating: SessionCandidate["lastRating"],
  due: Date = FUTURE,
): SessionCandidate {
  return { id, kind, sourceId, due, lastRating };
}

describe("priorityTier", () => {
  it("ranks never reviewed and missed first, then due, then the rest", () => {
    expect(priorityTier(candidate("a", "quiz", "s1", undefined), NOW)).toBe(0);
    expect(priorityTier(candidate("b", "quiz", "s1", "again"), NOW)).toBe(0);
    expect(priorityTier(candidate("c", "quiz", "s1", "hard", PAST), NOW)).toBe(1);
    expect(priorityTier(candidate("d", "quiz", "s1", "easy", FUTURE), NOW)).toBe(2);
  });
});

describe("planSession", () => {
  it("takes the weakest items first and stops at the session size", () => {
    const plan = planSession(
      [
        candidate("strong", "quiz", "s1", "easy"),
        candidate("due", "why", "s2", "hard", PAST),
        candidate("missed", "cloze", "s1", "again"),
      ],
      2,
      NOW,
    );
    expect(plan.map((item) => item.id)).toEqual(["missed", "due"]);
  });

  it("alternates kind and source when there is a choice", () => {
    const plan = planSession(
      [
        candidate("q1", "quiz", "s1", undefined),
        candidate("q2", "quiz", "s1", undefined),
        candidate("c1", "cloze", "s1", undefined),
        candidate("w2", "why", "s2", undefined),
      ],
      4,
      NOW,
    );
    expect(plan.map((item) => item.id)).toEqual(["c1", "w2", "q1", "q2"]);
  });

  it("falls back to repeating when nothing else is left", () => {
    const plan = planSession(
      [candidate("q1", "quiz", "s1", undefined), candidate("q2", "quiz", "s1", undefined)],
      5,
      NOW,
    );
    expect(plan.map((item) => item.id)).toEqual(["q1", "q2"]);
  });
});
