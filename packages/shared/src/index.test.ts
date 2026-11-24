import { describe, expect, it } from "vitest";
import { healthStatusSchema } from "./index";

describe("healthStatusSchema", () => {
  it("accepts valid health statuses", () => {
    expect(healthStatusSchema.parse("ok")).toBe("ok");
  });
});
