import { describe, expect, it } from "vitest";
import {
  askNotebookSchema,
  MAX_ASK_QUESTION_CHARS,
  SESSION_SIZE,
  studioSessionRequestSchema,
} from "./studio";

describe("askNotebookSchema", () => {
  it("trims the question and keeps optional sources", () => {
    expect(askNotebookSchema.parse({ question: "  O que é TCP?  ", sourceIds: ["s1"] })).toEqual({
      question: "O que é TCP?",
      sourceIds: ["s1"],
    });
  });

  it("refuses empty, too long and unknown fields", () => {
    expect(askNotebookSchema.safeParse({ question: "  " }).success).toBe(false);
    expect(
      askNotebookSchema.safeParse({ question: "x".repeat(MAX_ASK_QUESTION_CHARS + 1) }).success,
    ).toBe(false);
    expect(askNotebookSchema.safeParse({ question: "O que é TCP?", sourceIds: [] }).success).toBe(
      false,
    );
    expect(askNotebookSchema.safeParse({ question: "O que é TCP?", extra: 1 }).success).toBe(false);
  });
});

describe("SESSION_SIZE", () => {
  it("fits one activity every 75 seconds", () => {
    expect(SESSION_SIZE).toEqual({ 10: 8, 20: 16, 40: 32 });
  });
});

describe("studioSessionRequestSchema", () => {
  it("accepts only the three session lengths and at least one source", () => {
    expect(studioSessionRequestSchema.parse({ sourceIds: ["s1"], minutes: 20 })).toEqual({
      sourceIds: ["s1"],
      minutes: 20,
    });
    expect(studioSessionRequestSchema.safeParse({ sourceIds: ["s1"], minutes: 15 }).success).toBe(
      false,
    );
    expect(studioSessionRequestSchema.safeParse({ sourceIds: [], minutes: 10 }).success).toBe(
      false,
    );
  });
});
