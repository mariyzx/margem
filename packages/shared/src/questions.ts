import { z } from "zod";

export const anchorStatusSchema = z.enum(["active", "orphaned"]);
export type AnchorStatus = z.infer<typeof anchorStatusSchema>;

export const questionAuthorTypeSchema = z.enum(["self", "group", "ai"]);
export type QuestionAuthorType = z.infer<typeof questionAuthorTypeSchema>;

export const questionStatusSchema = z.enum(["pending", "approved", "discarded"]);
export type QuestionStatus = z.infer<typeof questionStatusSchema>;

export const anchorSchema = z.object({
  id: z.string(),
  noteId: z.string().nullable(),
  blockId: z.string(),
  quote: z.string(),
  prefix: z.string(),
  suffix: z.string(),
  status: anchorStatusSchema,
});
export type AnchorDto = z.infer<typeof anchorSchema>;

export const questionSchema = z.object({
  id: z.string(),
  noteId: z.string(),
  anchorId: z.string().nullable(),
  authorType: questionAuthorTypeSchema,
  authorId: z.string().nullable(),
  text: z.string(),
  answer: z.string(),
  status: questionStatusSchema,
  anchor: anchorSchema.nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type QuestionDto = z.infer<typeof questionSchema>;

export const createQuestionSchema = z.object({
  text: z.string().trim().min(1, "Escreva a pergunta").max(500, "Pergunta muito longa"),
  answer: z.string().trim().min(1, "Escreva a resposta").max(2000, "Resposta muito longa"),
  anchor: z
    .object({
      blockId: z.string().min(1),
      quote: z.string().trim().min(1),
      prefix: z.string().max(120).default(""),
      suffix: z.string().max(120).default(""),
    })
    .optional(),
});
export type CreateQuestionInput = z.infer<typeof createQuestionSchema>;

export const updateQuestionSchema = z.object({
  text: z.string().trim().min(1, "Escreva a pergunta").max(500, "Pergunta muito longa").optional(),
  answer: z
    .string()
    .trim()
    .min(1, "Escreva a resposta")
    .max(2000, "Resposta muito longa")
    .optional(),
});
export type UpdateQuestionInput = z.infer<typeof updateQuestionSchema>;

export const questionSuggestionsSchema = z.object({
  clozes: z.array(z.object({ blockId: z.string(), quote: z.string() })),
  questions: z.array(questionSchema),
});
export type QuestionSuggestionsDto = z.infer<typeof questionSuggestionsSchema>;

export interface NoteBlockText {
  blockId: string;
  text: string;
}

export interface AnchorMatch {
  found: boolean;
  blockId: string;
}

function extractNodeText(node: unknown): string {
  if (!node || typeof node !== "object") return "";
  const record = node as { text?: unknown; content?: unknown };
  if (typeof record.text === "string") return record.text;
  if (!Array.isArray(record.content)) return "";
  return record.content.map(extractNodeText).join("");
}

export function extractNoteBlocks(doc: Record<string, unknown>): NoteBlockText[] {
  const blocks = Array.isArray(doc.content) ? doc.content : [];
  const result: NoteBlockText[] = [];
  for (const rawBlock of blocks) {
    if (!rawBlock || typeof rawBlock !== "object") continue;
    const block = rawBlock as { attrs?: { blockId?: unknown } };
    const blockId = typeof block.attrs?.blockId === "string" ? block.attrs.blockId : "";
    const text = extractNodeText(block);
    if (blockId && text.trim()) result.push({ blockId, text });
  }
  return result;
}

/**
 * Resolves a relative anchor against a TipTap JSON document.
 * Checks the original block first, then falls back to any block matching prefix + quote + suffix.
 */
export function resolveAnchorInDoc(
  doc: Record<string, unknown>,
  anchor: Pick<AnchorDto, "blockId" | "quote" | "prefix" | "suffix">,
): AnchorMatch {
  const blocks = Array.isArray(doc.content) ? doc.content : [];
  const targetWithContext = `${anchor.prefix}${anchor.quote}${anchor.suffix}`;

  for (const rawBlock of blocks) {
    if (!rawBlock || typeof rawBlock !== "object") continue;
    const block = rawBlock as { attrs?: { blockId?: unknown } };
    const blockId = typeof block.attrs?.blockId === "string" ? block.attrs.blockId : "";
    if (blockId !== anchor.blockId) continue;

    const text = extractNodeText(block);
    if (text.includes(targetWithContext) || text.includes(anchor.quote)) {
      return { found: true, blockId };
    }
  }

  for (const rawBlock of blocks) {
    if (!rawBlock || typeof rawBlock !== "object") continue;
    const block = rawBlock as { attrs?: { blockId?: unknown } };
    const blockId = typeof block.attrs?.blockId === "string" ? block.attrs.blockId : "";
    const text = extractNodeText(block);
    if (targetWithContext.length > anchor.quote.length && text.includes(targetWithContext)) {
      return { found: true, blockId };
    }
    if (text.includes(anchor.quote)) {
      return { found: true, blockId };
    }
  }

  return { found: false, blockId: anchor.blockId };
}
