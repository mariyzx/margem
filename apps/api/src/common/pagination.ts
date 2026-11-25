import { BadRequestException } from "@nestjs/common";
import { type PaginationQuery, paginationQuerySchema } from "@margem/shared";

export function parsePagination(query: unknown): PaginationQuery {
  const parsed = paginationQuerySchema.safeParse(query ?? {});
  if (!parsed.success) {
    throw new BadRequestException(parsed.error.flatten());
  }
  return parsed.data;
}

/** Prisma args for keyset pagination by id: fetch one extra row to know if there is a next page. */
export function cursorArgs({ limit, cursor }: PaginationQuery) {
  return {
    take: limit + 1,
    ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
  };
}

export function toPage<T extends { id: string }>(
  rows: T[],
  limit: number,
): { items: T[]; nextCursor: string | null } {
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  return { items, nextCursor: hasMore ? items[items.length - 1]!.id : null };
}
