import type { PromptData, PromptSpec } from "../prompt";

export const MAX_EXPLANATION_CHARS = 1200;

export interface ExplainInput {
  question: string;
  expected: string;
  answer: string;
  context?: string;
}

const INSTRUCTIONS = [
  "A pessoa tentou responder uma pergunta de estudo e errou ou acertou só em parte.",
  "Explique de outro jeito, em até 4 frases curtas e em linguagem simples:",
  "- comece pelo que ela acertou, se houver;",
  "- mostre a ideia que faltou, com um exemplo ou analogia;",
  "- não repita a resposta esperada palavra por palavra e não escreva uma resposta pronta para decorar.",
  "Use só o que está na resposta esperada e no trecho da nota. Responda só com o texto da explicação, sem título nem lista.",
].join("\n");

export function buildExplainAfterErrorPrompt(input: ExplainInput): PromptSpec {
  const data: PromptData[] = [
    { label: "pergunta", text: input.question },
    { label: "resposta esperada", text: input.expected },
    { label: "resposta da pessoa", text: input.answer },
  ];
  if (input.context) data.push({ label: "trecho da nota", text: input.context });
  return { instructions: INSTRUCTIONS, data };
}
