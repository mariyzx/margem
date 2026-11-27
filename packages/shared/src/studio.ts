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
