import { answerVerdictSchema } from "@margem/shared";
import { z } from "zod";
import type { PromptData, PromptSpec } from "../prompt";

export const MAX_MISSING_POINTS = 5;
export const MAX_MISSING_POINT_CHARS = 200;

export interface AnswerToGrade {
  id: string;
  question: string;
  expected: string;
  answer: string;
}

export function gradeAnswerOutputSchema(ids: string[]) {
  const sent = new Set(ids);
  return z
    .object({
      results: z.array(
        z.object({
          id: z.string(),
          verdict: answerVerdictSchema,
          missing: z.array(z.string()).default([]),
        }),
      ),
    })
    .refine(
      ({ results }) =>
        results.length === sent.size &&
        new Set(results.map((result) => result.id)).size === sent.size &&
        results.every((result) => sent.has(result.id)),
      { message: "one result per sent id" },
    );
}

const INSTRUCTIONS = [
  "Você corrige respostas escritas de uma pessoa que está estudando.",
  'Para cada pergunta há "pergunta", "resposta esperada" e "resposta da pessoa", todas com o mesmo id.',
  "",
  "Para cada id:",
  '- "verdict": "right" se a resposta da pessoa cobre a ideia principal da esperada (palavras diferentes valem); "partial" se acerta parte; "wrong" se erra ou não responde.',
  `- "missing": até ${MAX_MISSING_POINTS} pontos curtos da resposta esperada que faltaram na resposta da pessoa. Lista vazia quando "right".`,
  "- Julgue só pela resposta esperada. Não traga informação de fora nem dê nota pela forma de escrever.",
  "",
  'Responda só com JSON: {"results":[{"id":"...","verdict":"right|partial|wrong","missing":["..."]}]}, um item por id recebido.',
].join("\n");

export function buildGradeAnswerPrompt(items: AnswerToGrade[]): PromptSpec {
  const data: PromptData[] = items.flatMap((item) => [
    { label: "pergunta", id: item.id, text: item.question },
    { label: "resposta esperada", id: item.id, text: item.expected },
    { label: "resposta da pessoa", id: item.id, text: item.answer },
  ]);
  return { instructions: INSTRUCTIONS, data };
}
