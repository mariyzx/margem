import type { ReviewRating } from "@prisma/client";

export interface SessionCandidate {
  id: string;
  kind: string;
  sourceId: string;
  due: Date;
  lastRating: ReviewRating | undefined;
}

export function priorityTier(candidate: SessionCandidate, now: Date): number {
  if (candidate.lastRating === undefined || candidate.lastRating === "again") return 0;
  if (candidate.due <= now) return 1;
  return 2;
}

export function byPriority(now: Date) {
  return (a: SessionCandidate, b: SessionCandidate): number =>
    priorityTier(a, now) - priorityTier(b, now) ||
    a.due.getTime() - b.due.getTime() ||
    a.id.localeCompare(b.id);
}

export function planSession<T extends SessionCandidate>(
  candidates: T[],
  size: number,
  now: Date,
): T[] {
  const pool = [...candidates].sort(byPriority(now));
  const plan: T[] = [];
  while (plan.length < size && pool.length > 0) {
    const previous = plan.at(-1);
    const index = previous ? pickIndex(pool, previous) : 0;
    plan.push(pool.splice(index, 1)[0]!);
  }
  return plan;
}

function pickIndex(pool: SessionCandidate[], previous: SessionCandidate): number {
  const preferences: Array<(candidate: SessionCandidate) => boolean> = [
    (candidate) => candidate.kind !== previous.kind && candidate.sourceId !== previous.sourceId,
    (candidate) => candidate.kind !== previous.kind,
    (candidate) => candidate.sourceId !== previous.sourceId,
  ];
  for (const prefers of preferences) {
    const index = pool.findIndex(prefers);
    if (index !== -1) return index;
  }
  return 0;
}
