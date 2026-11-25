import { describe, expect, it } from "vitest";
import { createInitialSrsState, previewSrsIntervals, scheduleSrsReview } from "./index";

describe("@margem/srs", () => {
  it("creates an initial card state due now", () => {
    const now = new Date("2026-11-25T12:00:00Z");
    const initial = createInitialSrsState(now);
    expect(initial.due).toEqual(now);
    expect(initial.reps).toBe(0);
  });

  it("schedules shorter interval on again than on easy", () => {
    const now = new Date("2026-11-25T12:00:00Z");
    const initial = createInitialSrsState(now);
    const previews = previewSrsIntervals(initial, now);
    const easyResult = scheduleSrsReview(initial, "easy", now);
    const againResult = scheduleSrsReview(initial, "again", now);

    expect(easyResult.nextState.due.getTime()).toBeGreaterThan(againResult.nextState.due.getTime());
    expect(previews.easy).toBe(easyResult.scheduledDays);
  });
});
