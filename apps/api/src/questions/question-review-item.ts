import type { Prisma } from "@prisma/client";
import { createInitialSrsState } from "@margem/srs";

const ONE_DAY_MS = 24 * 60 * 60 * 1000;

export async function createQuestionReviewItem(
  tx: Prisma.TransactionClient,
  userId: string,
  questionId: string,
): Promise<void> {
  const initialSrs = createInitialSrsState(new Date(Date.now() + ONE_DAY_MS));
  await tx.reviewItem.create({
    data: {
      userId,
      kind: "question",
      refId: questionId,
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
