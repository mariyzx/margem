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
  url: z.string().nullable().optional(),
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

export const createLinkSourceSchema = z.object({
  notebookId: z.string().min(1, "Caderno obrigatório"),
  title: z.string().trim().max(120, "Título muito longo").optional(),
  url: z
    .string()
    .trim()
    .url("Informe um endereço válido")
    .max(2000, "Endereço muito longo")
    .refine((val) => {
      try {
        const parsed = new URL(val);
        return parsed.protocol === "http:" || parsed.protocol === "https:";
      } catch {
        return false;
      }
    }, "Informe um endereço começando com http:// ou https://"),
});
export type CreateLinkSourceInput = z.infer<typeof createLinkSourceSchema>;

export const memoryGapSchema = z.object({
  chunkId: z.string(),
  ord: z.number().int(),
  page: z.number().int().nullable(),
  excerpt: z.string(),
  score: z.number(),
});
export type MemoryGapDto = z.infer<typeof memoryGapSchema>;