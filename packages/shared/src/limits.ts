import { z } from "zod";

export const PAGE_DEFAULT_LIMIT = 50;
export const PAGE_MAX_LIMIT = 100;

/** Query string for cursor-paginated lists: `?limit=50&cursor=<id of the last item seen>`. */
export const paginationQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(PAGE_MAX_LIMIT).default(PAGE_DEFAULT_LIMIT),
  cursor: z.string().trim().min(1).max(64).optional(),
});
export type PaginationQuery = z.infer<typeof paginationQuerySchema>;

export const nextCursorSchema = z.string().nullable();

export const QUOTA_EXCEEDED_CODE = "quota_exceeded";

export const quotaResourceSchema = z.enum([
  "notebooks",
  "notes",
  "sources",
  "questions",
  "practice",
  "storage",
]);
export type QuotaResource = z.infer<typeof quotaResourceSchema>;

/** Body of the 422 the API returns when a per-user cap is reached. */
export const quotaExceededErrorSchema = z.object({
  code: z.literal(QUOTA_EXCEEDED_CODE),
  resource: quotaResourceSchema,
  limit: z.number().int().positive(),
  message: z.string(),
});
export type QuotaExceededError = z.infer<typeof quotaExceededErrorSchema>;
