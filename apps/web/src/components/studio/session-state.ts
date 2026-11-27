import {
  type ReviewRating,
  SESSION_SECONDS_PER_ACTIVITY,
  type SessionActivityDto,
  type SessionMinutes,
} from "@margem/shared";

export type SessionOutcome = ReviewRating | "skipped";

export interface SessionPlan {
  key: string;
  activities: SessionActivityDto[];
}

export interface SessionState {
  sourceIds: string[];
  minutes: SessionMinutes;
  plan: SessionPlan | null;
  index: number;
  answer: string;
  revealed: boolean;
  outcomes: Record<string, SessionOutcome>;
}

export type SessionEvent =
  | { type: "configure"; sourceIds: string[]; minutes?: SessionMinutes }
  | { type: "toggleSource"; sourceId: string }
  | { type: "pickMinutes"; minutes: SessionMinutes }
  | { type: "planned"; plan: SessionPlan }
  | { type: "typeAnswer"; value: string }
  | { type: "reveal" }
  | { type: "rated"; rating: ReviewRating }
  | { type: "skip" };

export const initialSessionState: SessionState = {
  sourceIds: [],
  minutes: 20,
  plan: null,
  index: 0,
  answer: "",
  revealed: false,
  outcomes: {},
};

export function planKey(sourceIds: string[], minutes: SessionMinutes): string {
  return `${[...sourceIds].sort().join(",")}|${minutes}`;
}

export function sessionStarted(state: SessionState): boolean {
  return state.index > 0 || state.revealed || state.answer.length > 0;
}

export function currentActivity(state: SessionState): SessionActivityDto | null {
  return state.plan?.activities[state.index] ?? null;
}

function advance(state: SessionState, outcome: SessionOutcome): SessionState {
  const activity = currentActivity(state);
  if (!activity) return state;
  return {
    ...state,
    index: state.index + 1,
    answer: "",
    revealed: false,
    outcomes: { ...state.outcomes, [activity.reviewItemId]: outcome },
  };
}

export function sessionReducer(state: SessionState, event: SessionEvent): SessionState {
  switch (event.type) {
    case "configure":
      return {
        ...initialSessionState,
        sourceIds: event.sourceIds,
        minutes: event.minutes ?? state.minutes,
      };
    case "toggleSource":
      return {
        ...state,
        sourceIds: state.sourceIds.includes(event.sourceId)
          ? state.sourceIds.filter((id) => id !== event.sourceId)
          : [...state.sourceIds, event.sourceId],
      };
    case "pickMinutes":
      return { ...state, minutes: event.minutes };
    case "planned":
      return { ...state, plan: event.plan, index: 0, answer: "", revealed: false, outcomes: {} };
    case "typeAnswer":
      return state.revealed ? state : { ...state, answer: event.value };
    case "reveal":
      return currentActivity(state) ? { ...state, revealed: true } : state;
    case "rated":
      return state.revealed ? advance(state, event.rating) : state;
    case "skip":
      return advance(state, "skipped");
  }
}

export function outcomeCounts(outcomes: Record<string, SessionOutcome>) {
  const counts = { again: 0, hard: 0, easy: 0, skipped: 0 };
  for (const outcome of Object.values(outcomes)) counts[outcome] += 1;
  return counts;
}

export function kindCounts(activities: SessionActivityDto[]) {
  const counts = { cloze: 0, quiz: 0, why: 0 };
  for (const activity of activities) counts[activity.kind] += 1;
  return counts;
}

const MINUTES_PER_ACTIVITY = SESSION_SECONDS_PER_ACTIVITY / 60;

export function remainingMinutes(state: SessionState): number {
  const left = (state.plan?.activities.length ?? 0) - state.index;
  if (left <= 0) return 0;
  return Math.min(state.minutes, Math.max(1, Math.round(left * MINUTES_PER_ACTIVITY)));
}
