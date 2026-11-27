import { CLOZE_BLANK, type PracticeKind, practiceKindSchema } from "@margem/shared";
import { z } from "zod";
import type { PromptSpec } from "../prompt";

export const MAX_GENERATED_PRACTICE = 8;
export const MAX_SOURCE_CHARS_FOR_PRACTICE = 10_000;

export const generatePracticeOutputSchema = z.object({
  items: z
    .array(
      z.object({
        kind: practiceKindSchema,
        prompt: z.string(),
        answer: z.string(),
        sourceChunkId: z.string(),
      }),
    )
    .max(30)
    .default([]),
});
export type GeneratePracticeOutput = z.infer<typeof generatePracticeOutputSchema>;

const KIND_RULES: Record<PracticeKind, string> = {
  quiz: '"quiz": uma pergunta que pede resposta escrita curta; "answer" é a resposta esperada.',
  flashcard: '"flashcard": frente com um conceito ou termo; "answer" é o verso, curto.',
  cloze: `"cloze": uma frase do trecho com uma parte importante trocada por ${CLOZE_BLANK}; "answer" é exatamente a parte escondida, copiada do trecho.`,
  why: '"why": uma pergunta "por quê?" ou "como?" que faça explicar; "answer" resume a explicação que está no trecho.',
};

export function buildGeneratePracticePrompt(
  excerpts: Array<{ id: string; text: string }>,
  kinds: PracticeKind[],
): PromptSpec {
  const instructions = [
    "Você cria exercícios de prática a partir de trechos de um material de estudo.",
    `Crie até ${MAX_GENERATED_PRACTICE} exercícios dos tipos pedidos, variando os trechos e priorizando as ideias centrais.`,
    "",
    "Tipos:",
    ...kinds.map((kind) => `- ${KIND_RULES[kind]}`),
    "",
    "Regras:",
    '- "sourceChunkId" é o id do trecho de onde o exercício saiu, igual ao do marcador.',
    "- Use só o que está no trecho. Não traga informação de fora.",
    "- O enunciado não pode conter a resposta.",
    "",
    'Responda só com JSON: {"items":[{"kind":"...","prompt":"...","answer":"...","sourceChunkId":"..."}]}',
  ].join("\n");

  return {
    instructions,
    data: excerpts.map((excerpt) => ({
      label: "trecho da fonte",
      id: excerpt.id,
      text: excerpt.text,
    })),
  };
}
