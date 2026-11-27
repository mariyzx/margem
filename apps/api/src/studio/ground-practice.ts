import { CLOZE_BLANK, type PracticeKind } from "@margem/shared";
import {
  type GeneratePracticeOutput,
  MAX_GENERATED_PRACTICE,
} from "../ai/prompts/generate-practice";

export const MAX_PRACTICE_PROMPT_CHARS = 500;
export const MAX_PRACTICE_ANSWER_CHARS = 1000;

export interface GroundedPractice {
  kind: PracticeKind;
  prompt: string;
  answer: string;
  sourceChunkId: string;
}

export function groundPractice(
  output: GeneratePracticeOutput,
  chunkTextByPromptId: Map<string, { chunkId: string; text: string }>,
  kinds: PracticeKind[],
): GroundedPractice[] {
  const allowed = new Set(kinds);
  const seen = new Set<string>();
  const grounded: GroundedPractice[] = [];

  for (const item of output.items) {
    if (grounded.length >= MAX_GENERATED_PRACTICE) break;
    const chunk = chunkTextByPromptId.get(item.sourceChunkId);
    const prompt = item.prompt.trim();
    const answer = item.answer.trim();
    if (!chunk || !allowed.has(item.kind) || !prompt || !answer) continue;
    if (prompt.length > MAX_PRACTICE_PROMPT_CHARS || answer.length > MAX_PRACTICE_ANSWER_CHARS) {
      continue;
    }
    if (item.kind === "cloze") {
      if (!prompt.includes(CLOZE_BLANK) || !chunk.text.includes(answer)) continue;
    } else if (normalize(prompt).includes(normalize(answer))) {
      continue;
    }
    const key = `${item.kind}\u0000${normalize(prompt)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    grounded.push({ kind: item.kind, prompt, answer, sourceChunkId: chunk.chunkId });
  }
  return grounded;
}

function normalize(text: string): string {
  return text.toLowerCase().replace(/\s+/g, " ").trim();
}
