export const STUDIO_MODES = ["overview", "read", "session"] as const;
export type StudioMode = (typeof STUDIO_MODES)[number];

export const SESSION_MINUTES = [10, 20, 40] as const;
export type SessionMinutes = (typeof SESSION_MINUTES)[number];

export interface StudioState {
  mode: StudioMode;
  direction: 1 | -1;
  read: { sourceId: string | null };
  session: { sourceIds: string[]; minutes: SessionMinutes };
}

export type StudioAction =
  | { type: "switch"; mode: StudioMode }
  | { type: "openMaterial"; sourceId: string }
  | { type: "practice"; sourceIds: string[]; minutes?: SessionMinutes };

export const initialStudioState: StudioState = {
  mode: "overview",
  direction: 1,
  read: { sourceId: null },
  session: { sourceIds: [], minutes: 20 },
};

function moveTo(state: StudioState, mode: StudioMode): StudioState {
  if (mode === state.mode) return state;
  const direction = STUDIO_MODES.indexOf(mode) > STUDIO_MODES.indexOf(state.mode) ? 1 : -1;
  return { ...state, mode, direction };
}

export function studioReducer(state: StudioState, action: StudioAction): StudioState {
  switch (action.type) {
    case "switch":
      return moveTo(state, action.mode);
    case "openMaterial":
      return { ...moveTo(state, "read"), read: { sourceId: action.sourceId } };
    case "practice":
      return {
        ...moveTo(state, "session"),
        session: {
          sourceIds: action.sourceIds,
          minutes: action.minutes ?? state.session.minutes,
        },
      };
  }
}

export function isStudioMode(value: string): value is StudioMode {
  return (STUDIO_MODES as readonly string[]).includes(value);
}
