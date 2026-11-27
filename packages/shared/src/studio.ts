import { z } from "zod";

export const practiceKindSchema = z.enum(["quiz", "flashcard", "cloze", "why"]);
export type PracticeKind = z.infer<typeof practiceKindSchema>;

export const practiceStatusSchema = z.enum(["pending", "approved", "discarded"]);
export type PracticeStatus = z.infer<typeof practiceStatusSchema>;

export const CLOZE_BLANK = "____";

export const practiceItemSchema = z.object({
  id: z.string(),
  notebookId: z.string(),
  sourceId: z.string(),
  sourceChunkId: z.string().nullable(),
  kind: practiceKindSchema,
  prompt: z.string(),
  answer: z.string(),
  createdBy: z.enum(["self", "ai"]),
  status: practiceStatusSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type PracticeItemDto = z.infer<typeof practiceItemSchema>;

export const generatePracticeSchema = z.strictObject({
  kinds: z.array(practiceKindSchema).min(1).max(4).optional(),
});
export type GeneratePracticeInput = z.infer<typeof generatePracticeSchema>;

export const MAX_ASK_QUESTION_CHARS = 500;

export const askNotebookSchema = z.strictObject({
  question: z
    .string()
    .trim()
    .min(3, "Escreva a pergunta")
    .max(MAX_ASK_QUESTION_CHARS, "Pergunta muito longa"),
  sourceIds: z.array(z.string().min(1)).min(1).max(20).optional(),
});
export type AskNotebookInput = z.infer<typeof askNotebookSchema>;

export const askCitationSchema = z.object({
  kind: z.enum(["chunk", "note"]),
  id: z.string(),
  title: z.string(),
  excerpt: z.string(),
  sourceId: z.string().nullable(),
  noteId: z.string().nullable(),
  blockId: z.string().nullable(),
  page: z.number().int().nullable(),
});
export type AskCitationDto = z.infer<typeof askCitationSchema>;

export const askNotebookResultSchema = z.object({
  found: z.boolean(),
  answer: z.string().nullable(),
  citations: z.array(askCitationSchema),
});
export type AskNotebookResultDto = z.infer<typeof askNotebookResultSchema>;
