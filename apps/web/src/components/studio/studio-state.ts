import type { PracticeKind, SessionMinutes } from "@margem/shared";
import { initialReadState, type ReadEvent, readReducer, type ReadState } from "./read-state";
import {
  initialSessionState,
  type SessionEvent,
  sessionReducer,
  type SessionState,
} from "./session-state";

export const STUDIO_MODES = ["overview", "read", "session"] as const;
export type StudioMode = (typeof STUDIO_MODES)[number];

export interface StudioState {
  mode: StudioMode;
  direction: 1 | -1;
  read: ReadState;
  session: SessionState;
}

export type StudioAction =
  | { type: "switch"; mode: StudioMode }
  | { type: "openMaterial"; sourceId: string; kind?: PracticeKind }
  | { type: "read"; event: ReadEvent }
  | { type: "session"; event: SessionEvent }
  | { type: "practice"; sourceIds: string[]; minutes?: SessionMinutes };

export const initialStudioState: StudioState = {
  mode: "overview",
  direction: 1,
  read: initialReadState,
  session: initialSessionState,
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
    case "openMaterial": {
      const picked = readReducer(state.read, { type: "pickSource", sourceId: action.sourceId });
      return {
        ...moveTo(state, "read"),
        read: action.kind ? readReducer(picked, { type: "pickKind", kind: action.kind }) : picked,
      };
    }
    case "read":
      return { ...state, read: readReducer(state.read, action.event) };
    case "practice":
      return {
        ...moveTo(state, "session"),
        session: sessionReducer(state.session, {
          type: "configure",
          sourceIds: action.sourceIds,
          minutes: action.minutes,
        }),
      };
    case "session":
      return { ...state, session: sessionReducer(state.session, action.event) };
  }
}

export function isStudioMode(value: string): value is StudioMode {
  return (STUDIO_MODES as readonly string[]).includes(value);
}
