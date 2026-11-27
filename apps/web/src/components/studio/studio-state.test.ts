import { describe, expect, it } from "vitest";
import { initialStudioState, studioReducer } from "./studio-state";

describe("studioReducer", () => {
  it("slides right when going forward and left when going back", () => {
    const read = studioReducer(initialStudioState, { type: "switch", mode: "read" });
    expect(read).toMatchObject({ mode: "read", direction: 1 });
    expect(studioReducer(read, { type: "switch", mode: "overview" })).toMatchObject({
      mode: "overview",
      direction: -1,
    });
  });

  it("keeps each mode's state when switching away and back", () => {
    const opened = studioReducer(initialStudioState, { type: "openMaterial", sourceId: "s1" });
    const planned = studioReducer(opened, { type: "practice", sourceIds: ["s2"], minutes: 40 });
    const back = studioReducer(studioReducer(planned, { type: "switch", mode: "overview" }), {
      type: "switch",
      mode: "read",
    });
    expect(back.read).toEqual({ sourceId: "s1" });
    expect(back.session).toEqual({ sourceIds: ["s2"], minutes: 40 });
  });

  it("keeps the chosen time when practicing without one", () => {
    const planned = studioReducer(initialStudioState, {
      type: "practice",
      sourceIds: ["s1"],
      minutes: 10,
    });
    expect(studioReducer(planned, { type: "practice", sourceIds: ["s2"] }).session).toEqual({
      sourceIds: ["s2"],
      minutes: 10,
    });
  });

  it("returns the same state when the mode does not change", () => {
    expect(studioReducer(initialStudioState, { type: "switch", mode: "overview" })).toBe(
      initialStudioState,
    );
  });
});
