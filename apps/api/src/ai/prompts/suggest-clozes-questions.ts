import type { NoteBlockText } from "@margem/shared";
import { z } from "zod";
import type { PromptSpec } from "../prompt";

export const MAX_SUGGESTED_CLOZES = 5;
export const MAX_SUGGESTED_QUESTIONS = 3;
export const MAX_NOTE_CHARS_FOR_SUGGESTIONS = 12_000;

export const suggestClozesQuestionsOutputSchema = z.object({
  clozes: z
    .array(z.object({ blockId: z.string(), quote: z.string() }))
    .max(20)
    .default([]),
  questions: z
    .array(
      z.object({
        blockId: z.string(),
        quote: z.string(),
        text: z.string(),
        answer: z.string(),
      }),
    )
    .max(20)
    .default([]),
});
export type SuggestClozesQuestionsOutput = z.infer<typeof suggestClozesQuestionsOutputSchema>;

const INSTRUCTIONS = [
  "Você ajuda uma pessoa a estudar a partir da nota que ela mesma escreveu.",
  "Tarefa: sugerir lacunas e perguntas de revisão. A pessoa decide se aprova cada uma; você não altera a nota.",
  "",
  `Lacunas (até ${MAX_SUGGESTED_CLOZES}): termos, nomes, números ou expressões curtas que valem ser lembrados. "quote" é o trecho que fica escondido.`,
  `Perguntas (até ${MAX_SUGGESTED_QUESTIONS}): de preferência "por quê" e "como", que façam a pessoa explicar com as próprias palavras. "quote" é o trecho da nota onde está a resposta; "answer" resume a resposta usando só o que a nota diz.`,
  "",
  "Regras:",
  '- "blockId" é o id do bloco de onde o trecho saiu, igual ao do marcador.',
  '- "quote" é copiado exatamente do texto do bloco, letra por letra, sem reescrever. Curto (até 80 caracteres).',
  "- Use só o que está escrito na nota. Não traga informação de fora nem corrija a pessoa.",
  "- Se a nota for curta demais, devolva listas vazias.",
  "",
  'Responda só com JSON neste formato: {"clozes":[{"blockId":"...","quote":"..."}],"questions":[{"blockId":"...","quote":"...","text":"...","answer":"..."}]}',
].join("\n");

export function buildSuggestClozesQuestionsPrompt(blocks: NoteBlockText[]): PromptSpec {
  return {
    instructions: INSTRUCTIONS,
    data: blocks.map((block) => ({ label: "bloco da nota", id: block.blockId, text: block.text })),
  };
}

export function fitBlocksToBudget(
  blocks: NoteBlockText[],
  maxChars: number = MAX_NOTE_CHARS_FOR_SUGGESTIONS,
): NoteBlockText[] {
  const fitted: NoteBlockText[] = [];
  let used = 0;
  for (const block of blocks) {
    if (used >= maxChars) break;
    const text = block.text.slice(0, maxChars - used);
    fitted.push({ blockId: block.blockId, text });
    used += text.length;
  }
  return fitted;
}
