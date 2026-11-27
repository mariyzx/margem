import type { AskCitationDto, AskNotebookResultDto } from "@margem/shared";
import { type AskNotebookOutput, MAX_ASK_ANSWER_CHARS } from "../ai/prompts/ask-notebook";

export function notFound(): AskNotebookResultDto {
  return { found: false, answer: null, citations: [] };
}

export function groundAnswer(
  output: AskNotebookOutput,
  citationsById: Map<string, AskCitationDto>,
): AskNotebookResultDto {
  const answer = output.answer.trim();
  if (!answer) return notFound();

  const seen = new Set<string>();
  const citations: AskCitationDto[] = [];
  for (const rawId of output.citations) {
    const id = rawId.trim();
    const citation = citationsById.get(id);
    if (!citation || seen.has(id)) continue;
    seen.add(id);
    citations.push(citation);
  }
  if (citations.length === 0) return notFound();

  const clipped =
    answer.length <= MAX_ASK_ANSWER_CHARS
      ? answer
      : `${answer.slice(0, MAX_ASK_ANSWER_CHARS - 1).trimEnd()}…`;
  return { found: true, answer: clipped, citations };
}
