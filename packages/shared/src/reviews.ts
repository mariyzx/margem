import { z } from "zod";

export const reviewKindSchema = z.enum(["cloze", "question", "practice", "link"]);
export type ReviewKind = z.infer<typeof reviewKindSchema>;

export const reviewRatingSchema = z.enum(["again", "hard", "easy"]);
export type ReviewRating = z.infer<typeof reviewRatingSchema>;

export const reviewCardSchema = z.object({
  id: z.string(),
  kind: reviewKindSchema,
  refId: z.string(),
  noteId: z.string().nullable(),
  notebookId: z.string().nullable(),
  notebookName: z.string().nullable(),
  prompt: z.string(),
  answer: z.string(),
  quote: z.string().nullable(),
  due: z.string(),
  intervals: z.object({
    again: z.number().int().nonnegative(),
    hard: z.number().int().nonnegative(),
    easy: z.number().int().nonnegative(),
  }),
});
export type ReviewCardDto = z.infer<typeof reviewCardSchema>;

export const submitReviewSchema = z.object({
  rating: reviewRatingSchema,
});
export type SubmitReviewInput = z.infer<typeof submitReviewSchema>;

export const STUDY_ERRORS_MAX_QUESTIONS = 100;

export const enqueueStudyErrorsSchema = z.object({
  noteId: z.string().min(1),
  questionIds: z.array(z.string().min(1)).min(1).max(STUDY_ERRORS_MAX_QUESTIONS),
});
export type EnqueueStudyErrorsInput = z.infer<typeof enqueueStudyErrorsSchema>;
