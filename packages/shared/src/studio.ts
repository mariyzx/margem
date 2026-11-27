import { z } from "zod";
import { sourceStatusSchema, sourceTypeSchema } from "./sources";

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

export const practiceDeckSchema = z.object({
  kind: practiceKindSchema,
  count: z.number().int().nonnegative(),
});
export type PracticeDeckDto = z.infer<typeof practiceDeckSchema>;

export const studioSourceSchema = z.object({
  id: z.string(),
  title: z.string(),
  type: sourceTypeSchema,
  status: sourceStatusSchema,
  createdAt: z.string(),
  reviewItems: z.number().int().nonnegative(),
  mastered: z.number().int().nonnegative(),
  mastery: z.number().int().min(0).max(100).nullable(),
  decks: z.array(practiceDeckSchema),
});
export type StudioSourceDto = z.infer<typeof studioSourceSchema>;

export const studioOverviewSchema = z.object({
  notebook: z.object({ id: z.string(), name: z.string() }),
  sources: z.array(studioSourceSchema),
});
export type StudioOverviewDto = z.infer<typeof studioOverviewSchema>;

export const SESSION_MINUTES = [10, 20, 40] as const;
export type SessionMinutes = (typeof SESSION_MINUTES)[number];

export const SESSION_SECONDS_PER_ACTIVITY = 75;

export const SESSION_SIZE = Object.fromEntries(
  SESSION_MINUTES.map((minutes) => [
    minutes,
    Math.floor((minutes * 60) / SESSION_SECONDS_PER_ACTIVITY),
  ]),
) as Record<SessionMinutes, number>;

export const sessionKindSchema = z.enum(["quiz", "cloze", "why"]);
export type SessionKind = z.infer<typeof sessionKindSchema>;

export const studioSessionRequestSchema = z.strictObject({
  sourceIds: z.array(z.string().min(1)).min(1, "Escolha pelo menos uma fonte").max(20),
  minutes: z.union([z.literal(10), z.literal(20), z.literal(40)]),
});
export type StudioSessionRequest = z.infer<typeof studioSessionRequestSchema>;

export const sessionActivitySchema = z.object({
  reviewItemId: z.string(),
  practiceId: z.string(),
  kind: sessionKindSchema,
  prompt: z.string(),
  answer: z.string(),
  sourceId: z.string(),
  sourceTitle: z.string(),
  excerpt: z.object({ text: z.string(), page: z.number().int().nullable() }).nullable(),
});
export type SessionActivityDto = z.infer<typeof sessionActivitySchema>;

export const studioSessionSchema = z.object({
  activities: z.array(sessionActivitySchema),
});
export type StudioSessionDto = z.infer<typeof studioSessionSchema>;
