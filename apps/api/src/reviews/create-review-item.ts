import type { Prisma, ReviewKind } from "@prisma/client";
import { createInitialSrsState } from "@margem/srs";

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

export async function createReviewItem(
  tx: Prisma.TransactionClient,
  userId: string,
  kind: ReviewKind,
  refId: string,
): Promise<void> {
  const initialSrs = createInitialSrsState(new Date(Date.now() + ONE_DAY_MS));
  await tx.reviewItem.create({
    data: {
      userId,
      kind,
      refId,
      due: initialSrs.due,
      stability: initialSrs.stability,
      difficulty: initialSrs.difficulty,
      scheduledDays: initialSrs.scheduledDays,
      learningSteps: initialSrs.learningSteps,
      reps: initialSrs.reps,
      lapses: initialSrs.lapses,
      state: initialSrs.state,
      lastReview: initialSrs.lastReview,
    },
  });
}
