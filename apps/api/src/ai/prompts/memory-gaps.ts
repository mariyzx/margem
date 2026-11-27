import { z } from "zod";
import type { PromptData, PromptSpec } from "../prompt";

export const MAX_AI_MEMORY_GAPS = 5;
export const MAX_GAP_POINT_CHARS = 200;
export const MAX_MEMORY_CHARS = 4_000;
export const MAX_SOURCE_CHARS = 10_000;

export interface SourceExcerpt {
  id: string;
  text: string;
}

export const memoryGapsOutputSchema = z.object({
  gaps: z
    .array(z.object({ point: z.string(), sourceChunkId: z.string() }))
    .max(20)
    .default([]),
});

const INSTRUCTIONS = [
  "A pessoa escreveu de memória o que lembra de um material e só depois abriu a fonte.",
  `Compare a nota de memória com os trechos da fonte e liste até ${MAX_AI_MEMORY_GAPS} pontos importantes da fonte que não aparecem na nota.`,
  "",
  "Regras:",
  '- "point": uma frase curta dizendo o que faltou, como um lembrete ("Faltou: ..."), sem explicar o conteúdo inteiro.',
  '- "sourceChunkId": o id do trecho da fonte de onde o ponto saiu, igual ao do marcador.',
  "- Só pontos centrais. Ignore detalhes, exemplos e o que a nota já cobre com outras palavras.",
  "- Não reescreva nem complete a nota e não traga informação que não está na fonte.",
  "- Se a nota cobre tudo o que importa, devolva a lista vazia.",
  "",
  'Responda só com JSON: {"gaps":[{"point":"...","sourceChunkId":"..."}]}',
].join("\n");

export function buildMemoryGapsPrompt(memory: string[], excerpts: SourceExcerpt[]): PromptSpec {
  const data: PromptData[] = [
    ...memory.map((text) => ({ label: "nota de memória", text })),
    ...excerpts.map((excerpt) => ({
      label: "trecho da fonte",
      id: excerpt.id,
      text: excerpt.text,
    })),
  ];
  return { instructions: INSTRUCTIONS, data };
}
