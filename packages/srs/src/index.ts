import { createEmptyCard, fsrs, Rating, State, type Card, type Grade } from "ts-fsrs";

export type SrsRating = "again" | "hard" | "easy";

export interface SrsCardState {
  due: Date;
  stability: number;
  difficulty: number;
  scheduledDays: number;
  learningSteps: number;
  reps: number;
  lapses: number;
  state: number;
  lastReview: Date | null;
}

const scheduler = fsrs();

const RATING_MAP: Record<SrsRating, Grade> = {
  again: Rating.Again,
  hard: Rating.Hard,
  easy: Rating.Good,
};

function toFsrsCard(state: SrsCardState): Card {
  return {
    due: state.due,
    stability: state.stability,
    difficulty: state.difficulty,
    scheduled_days: state.scheduledDays,
    learning_steps: state.learningSteps,
    reps: state.reps,
    lapses: state.lapses,
    state: state.state as State,
    last_review: state.lastReview ?? undefined,
  };
}

function fromFsrsCard(card: Card): SrsCardState {
  return {
    due: card.due,
    stability: card.stability,
    difficulty: card.difficulty,
    scheduledDays: card.scheduled_days,
    learningSteps: card.learning_steps,
    reps: card.reps,
    lapses: card.lapses,
    state: card.state,
    lastReview: card.last_review ?? null,
  };
}

export function createInitialSrsState(now = new Date()): SrsCardState {
  return fromFsrsCard(createEmptyCard(now));
}

export function scheduleSrsReview(
  current: SrsCardState,
  rating: SrsRating,
  now = new Date(),
): { nextState: SrsCardState; scheduledDays: number } {
  const outcomes = scheduler.repeat(toFsrsCard(current), now);
  const chosen = outcomes[RATING_MAP[rating]];
  return {
    nextState: fromFsrsCard(chosen.card),
    scheduledDays: chosen.card.scheduled_days,
  };
}

export function previewSrsIntervals(
  current: SrsCardState,
  now = new Date(),
): Record<SrsRating, number> {
  const outcomes = scheduler.repeat(toFsrsCard(current), now);
  return {
    again: outcomes[Rating.Again].card.scheduled_days,
    hard: outcomes[Rating.Hard].card.scheduled_days,
    easy: outcomes[Rating.Good].card.scheduled_days,
  };
}
