import { describe, expect, it } from "vitest";
import { askNotebookSchema, MAX_ASK_QUESTION_CHARS } from "./studio";

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
