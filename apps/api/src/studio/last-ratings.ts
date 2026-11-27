import { Prisma, type ReviewRating } from "@prisma/client";
import type { PrismaService } from "../prisma/prisma.service";

export async function lastRatings(
  prisma: PrismaService,
  reviewItemIds: string[],
): Promise<Map<string, ReviewRating>> {
  if (reviewItemIds.length === 0) return new Map();
  const rows = await prisma.$queryRaw<Array<{ reviewItemId: string; rating: ReviewRating }>>`
    SELECT DISTINCT ON ("reviewItemId") "reviewItemId", "rating"
    FROM "ReviewLog"
    WHERE "reviewItemId" IN (${Prisma.join(reviewItemIds)})
    ORDER BY "reviewItemId", "reviewedAt" DESC, "id" DESC
  `;
  return new Map(rows.map((row) => [row.reviewItemId, row.rating]));
}
