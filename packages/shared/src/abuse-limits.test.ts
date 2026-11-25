import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  EMAIL_MAX_LENGTH,
  MAGIC_LINK_TOKEN_LENGTH,
  STUDY_ERRORS_MAX_QUESTIONS,
  enqueueStudyErrorsSchema,
  magicLinkRequestSchema,
  magicLinkVerifySchema,
} from "./index";

describe("magicLinkRequestSchema", () => {
  it("normalizes and accepts a regular e-mail", () => {
    expect(magicLinkRequestSchema.parse({ email: "  Ana@Example.com " }).email).toBe(
      "ana@example.com",
    );
  });

  it("rejects e-mails longer than 254 characters", () => {
    const local = "a".repeat(64);
    const domain = `${"b".repeat(EMAIL_MAX_LENGTH - local.length - 1 - 4)}.com`;
    const exact = `${local}@${domain}`;
    expect(exact).toHaveLength(EMAIL_MAX_LENGTH);
    expect(magicLinkRequestSchema.safeParse({ email: `a${exact}` }).success).toBe(false);
  });
});

describe("magicLinkVerifySchema", () => {
  it("accepts a token in the generated format", () => {
    const token = randomBytes(32).toString("base64url");
    expect(token).toHaveLength(MAGIC_LINK_TOKEN_LENGTH);
    expect(magicLinkVerifySchema.safeParse({ token }).success).toBe(true);
  });

  it("rejects tokens with the wrong length or alphabet", () => {
    expect(magicLinkVerifySchema.safeParse({ token: "short" }).success).toBe(false);
    expect(magicLinkVerifySchema.safeParse({ token: "a".repeat(5000) }).success).toBe(false);
    expect(
      magicLinkVerifySchema.safeParse({ token: `${"a".repeat(MAGIC_LINK_TOKEN_LENGTH - 1)}=` })
        .success,
    ).toBe(false);
  });
});

describe("enqueueStudyErrorsSchema", () => {
  const ids = (n: number) => Array.from({ length: n }, (_, i) => `q-${i}`);

  it("accepts up to 100 question ids", () => {
    expect(
      enqueueStudyErrorsSchema.safeParse({
        noteId: "n1",
        questionIds: ids(STUDY_ERRORS_MAX_QUESTIONS),
      }).success,
    ).toBe(true);
  });

  it("rejects more than 100 question ids", () => {
    expect(
      enqueueStudyErrorsSchema.safeParse({
        noteId: "n1",
        questionIds: ids(STUDY_ERRORS_MAX_QUESTIONS + 1),
      }).success,
    ).toBe(false);
  });
});
