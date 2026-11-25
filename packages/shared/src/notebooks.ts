import { z } from "zod";

export const notebookColorSchema = z.enum(["bic", "correct", "turma", "marker", "ink"]);
export type NotebookColor = z.infer<typeof notebookColorSchema>;

export const NOTEBOOK_COLORS: readonly NotebookColor[] = [
  "bic",
  "correct",
  "turma",
  "marker",
  "ink",
] as const;

export const createNotebookSchema = z.object({
  name: z.string().trim().min(1, "Dê um nome para o caderno").max(80, "Nome muito longo"),
  color: notebookColorSchema.default("bic"),
});
export type CreateNotebookInput = z.infer<typeof createNotebookSchema>;

export const updateNotebookSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Dê um nome para o caderno")
    .max(80, "Nome muito longo")
    .optional(),
  color: notebookColorSchema.optional(),
});
export type UpdateNotebookInput = z.infer<typeof updateNotebookSchema>;

export const noteSummarySchema = z.object({
  id: z.string(),
  notebookId: z.string(),
  title: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type NoteSummary = z.infer<typeof noteSummarySchema>;

export const notebookSchema = z.object({
  id: z.string(),
  name: z.string(),
  color: notebookColorSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
  notes: z.array(noteSummarySchema).optional(),
});
export type NotebookDto = z.infer<typeof notebookSchema>;

export const noteSchema = z.object({
  id: z.string(),
  notebookId: z.string(),
  authorId: z.string(),
  title: z.string(),
  doc: z.record(z.string(), z.unknown()),
  materialOpenedAt: z.string().nullable(),
  sourceId: z.string().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type NoteDto = z.infer<typeof noteSchema>;

export const createNoteSchema = z.object({
  notebookId: z.string().min(1, "Caderno obrigatório"),
  title: z.string().trim().max(160, "Título muito longo").optional(),
  doc: z.record(z.string(), z.unknown()).optional(),
  sourceId: z.string().min(1).optional(),
});
export type CreateNoteInput = z.infer<typeof createNoteSchema>;

export const updateNoteSchema = z.object({
  title: z.string().trim().max(160, "Título muito longo").optional(),
  doc: z.record(z.string(), z.unknown()).optional(),
  materialOpenedAt: z.string().datetime().optional(),
});

export type UpdateNoteInput = z.infer<typeof updateNoteSchema>;
