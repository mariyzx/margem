import { z } from "zod";

export const searchQuerySchema = z.object({
  notebookId: z.string().min(1, "Caderno obrigatório"),
  q: z.string().trim().min(1, "Digite algo para buscar").max(200, "Busca muito longa"),
  limit: z.coerce.number().int().min(1).max(30).default(10),
});
export type SearchQueryInput = z.infer<typeof searchQuerySchema>;

export const searchHitSchema = z.object({
  kind: z.enum(["chunk", "note"]),
  id: z.string(),
  title: z.string(),
  snippet: z.string(),
  sourceId: z.string().nullable(),
  noteId: z.string().nullable(),
  page: z.number().int().nullable(),
  score: z.number(),
});
export type SearchHitDto = z.infer<typeof searchHitSchema>;
