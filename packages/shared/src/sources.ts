import { z } from "zod";

export const noteOriginSchema = z.enum(["memory", "material"]);
export type NoteOrigin = z.infer<typeof noteOriginSchema>;

export const sourceTypeSchema = z.enum(["file", "link", "text"]);
export type SourceType = z.infer<typeof sourceTypeSchema>;

export const sourceStatusSchema = z.enum(["queued", "processing", "ready", "failed"]);
export type SourceStatus = z.infer<typeof sourceStatusSchema>;

export const sourceSchema = z.object({
  id: z.string(),
  notebookId: z.string(),
  type: sourceTypeSchema,
  title: z.string(),
  content: z.string().nullable(),
  status: sourceStatusSchema,
  createdAt: z.string(),
  updatedAt: z.string(),
});
export type SourceDto = z.infer<typeof sourceSchema>;

export const createTextSourceSchema = z.object({
  notebookId: z.string().min(1, "Caderno obrigatório"),
  title: z.string().trim().min(1, "Dê um título para o material").max(120, "Título muito longo"),
  content: z.string().trim().min(1, "Cole o texto do material").max(50_000, "Texto muito longo"),
});
export type CreateTextSourceInput = z.infer<typeof createTextSourceSchema>;
