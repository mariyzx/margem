import type { ZodType } from "zod";

export function parseStructured<T>(text: string, schema: ZodType<T>): T | null {
  const fenced = /^\s*```(?:json)?\s*([\s\S]*?)\s*```\s*$/i.exec(text);
  const raw = fenced ? fenced[1]! : text;
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return null;
  }
  const parsed = schema.safeParse(json);
  return parsed.success ? parsed.data : null;
}
