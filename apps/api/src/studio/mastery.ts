import type { ReviewRating } from "@prisma/client";

const MASTERED: ReadonlySet<ReviewRating> = new Set<ReviewRating>(["hard", "easy"]);

export interface MasteryCount {
  reviewItems: number;
  mastered: number;
  mastery: number | null;
}

export function masteryOf(lastRatings: Array<ReviewRating | undefined>): MasteryCount {
  const reviewItems = lastRatings.length;
  const mastered = lastRatings.filter((rating) => rating && MASTERED.has(rating)).length;
  const mastery = reviewItems === 0 ? null : Math.round((mastered / reviewItems) * 100);
  return { reviewItems, mastered, mastery };
}

export function byWeakestFirst<T extends { mastery: number | null; title: string }>(
  a: T,
  b: T,
): number {
  if (a.mastery === null && b.mastery === null) return a.title.localeCompare(b.title, "pt-BR");
  if (a.mastery === null) return 1;
  if (b.mastery === null) return -1;
  return a.mastery - b.mastery || a.title.localeCompare(b.title, "pt-BR");
}
