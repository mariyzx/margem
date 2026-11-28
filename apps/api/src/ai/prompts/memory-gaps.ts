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
  "Sua tarefa é apontar as ideias centrais da fonte que a nota não menciona de jeito nenhum.",
  "",
  "Como decidir:",
  "- Para cada ideia central da fonte, procure na nota algo que trate dela. Se a nota fala da ideia, mesmo com outras palavras, de forma simples, informal ou com menos detalhe, ela está coberta e não entra.",
  "- Só entra o que a nota não menciona em nenhuma frase.",
  "- Não são lacunas: exemplos, nomes de produtos ou ferramentas, listas de casos de uso, termos técnicos de algo que a nota já explica, e perguntas de revisão, exercícios ou gabaritos da fonte.",
  `- Uma lista vazia é uma resposta comum e correta. Não complete a lista para chegar a um número; devolva no máximo ${MAX_AI_MEMORY_GAPS}.`,
  "",
  "Regras:",
  '- "point": uma frase curta dizendo o que faltou, como um lembrete ("Faltou: ..."), sem explicar o conteúdo inteiro.',
  '- "sourceChunkId": o id do trecho da fonte de onde o ponto saiu, igual ao do marcador.',
  "- Não reescreva nem complete a nota e não traga informação que não está na fonte.",
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
