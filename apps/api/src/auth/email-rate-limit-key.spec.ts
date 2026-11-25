import { describe, expect, it } from "vitest";
import { normalizeEmailForRateLimit } from "./email-rate-limit-key";

describe("normalizeEmailForRateLimit", () => {
  it.each([
    ["a.b+x@gmail.com", "ab@gmail.com"],
    ["A.B@GoogleMail.com", "ab@gmail.com"],
    ["  Ab+news@Gmail.com ", "ab@gmail.com"],
    ["a.b+x@outlook.com", "a.b@outlook.com"],
    ["Ana@Example.com", "ana@example.com"],
    ["ana+a+b@example.com", "ana@example.com"],
  ])("%s -> %s", (input, expected) => {
    expect(normalizeEmailForRateLimit(input)).toBe(expected);
  });

  it("keeps the dots outside gmail", () => {
    expect(normalizeEmailForRateLimit("a.b@outlook.com")).not.toBe(
      normalizeEmailForRateLimit("ab@outlook.com"),
    );
  });
});
