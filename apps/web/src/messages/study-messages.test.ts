import { describe, expect, it } from "vitest";
import { messages } from "./pt-br";

describe("study grading label", () => {
  it.each([
    [0, "Corrigir minhas respostas"],
    [1, "Corrigir minha resposta"],
    [3, "Corrigir minhas 3 respostas"],
  ])("counts %i answers", (count, label) => {
    expect(messages.study.gradeAll(count)).toBe(label);
  });
});
