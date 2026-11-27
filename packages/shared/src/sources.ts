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

export const checkMemoryGapsSchema = z.strictObject({ noteId: z.string().trim().min(1) });
export type CheckMemoryGapsInput = z.infer<typeof checkMemoryGapsSchema>;

export const aiMemoryGapSchema = z.object({
  point: z.string(),
  chunkId: z.string(),
  ord: z.number().int(),
  page: z.number().int().nullable(),
  excerpt: z.string(),
});
export type AiMemoryGapDto = z.infer<typeof aiMemoryGapSchema>;

export const MAX_READ_CHUNKS = 500;

export const sourceChunkSchema = z.object({
  id: z.string(),
  ord: z.number().int().nonnegative(),
  page: z.number().int().nullable(),
  text: z.string(),
});
export type SourceChunkDto = z.infer<typeof sourceChunkSchema>;

export const sourceChunksSchema = z.object({
  chunks: z.array(sourceChunkSchema),
  truncated: z.boolean(),
});
export type SourceChunksDto = z.infer<typeof sourceChunksSchema>;

interface DocNode {
  text?: string;
  attrs?: Record<string, unknown>;
  content?: DocNode[];
}

function collectNodeText(node: DocNode): string {
  if (typeof node.text === "string") return node.text;
  if (!Array.isArray(node.content)) return "";
  return node.content.map(collectNodeText).join(" ");
}

export function extractMemoryParagraphs(doc: unknown): string[] {
  if (!doc || typeof doc !== "object") return [];
  const root = doc as DocNode;
  if (!Array.isArray(root.content)) return [];

  const paragraphs: string[] = [];
  for (const block of root.content) {
    if (block.attrs?.origin === "material") continue;
    const text = collectNodeText(block).replace(/\s+/g, " ").trim();
    if (text.length >= 3) paragraphs.push(text);
  }
  return paragraphs;
}
