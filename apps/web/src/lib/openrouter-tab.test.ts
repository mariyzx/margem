import { describe, expect, it } from "vitest";
import { isOpenRouterTabMessage } from "./openrouter-tab";

describe("isOpenRouterTabMessage", () => {
  it("accepts only the result message this app sends", () => {
    expect(isOpenRouterTabMessage({ type: "openrouter-result", result: "connected" })).toBe(true);
    expect(isOpenRouterTabMessage({ type: "openrouter-result", result: 1 })).toBe(false);
    expect(isOpenRouterTabMessage({ type: "other", result: "connected" })).toBe(false);
    expect(isOpenRouterTabMessage("connected")).toBe(false);
    expect(isOpenRouterTabMessage(null)).toBe(false);
  });
});
