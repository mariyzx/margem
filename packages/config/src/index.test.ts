import { describe, expect, it } from "vitest";
import { cn } from "./cn";
import { MOTION_DURATIONS, MOTION_EASINGS } from "./motion";

describe("cn", () => {
  it("merges conflicting Tailwind classes keeping the last one", () => {
    expect(cn("px-4 bg-bic", "bg-danger")).toBe("px-4 bg-danger");
  });

  it("handles conditional classes", () => {
    const isActive = false;
    expect(cn("text-ink", isActive && "text-bic")).toBe("text-ink");
  });
});

describe("motion tokens", () => {
  it("matches design system durations and easings", () => {
    expect(MOTION_DURATIONS.base).toBe(0.22);
    expect(MOTION_EASINGS.out).toEqual([0.2, 0.8, 0.2, 1]);
  });
});
