import type { AskNotebookResultDto, PracticeKind } from "@margem/shared";

export type PracticeResult = "right" | "wrong";

export interface ReadState {
  sourceId: string | null;
  kind: PracticeKind;
  answers: Record<string, string>;
  revealed: Record<string, true>;
  flipped: Record<string, boolean>;
  results: Record<string, PracticeResult>;
  shownBlanks: Record<string, true>;
  question: string;
  asked: AskNotebookResultDto | null;
}

export type ReadEvent =
  | { type: "pickSource"; sourceId: string }
  | { type: "pickKind"; kind: PracticeKind }
  | { type: "typeAnswer"; practiceId: string; value: string }
  | { type: "reveal"; practiceId: string }
  | { type: "flip"; practiceId: string }
  | { type: "rate"; practiceId: string; result: PracticeResult }
  | { type: "showBlank"; practiceId: string }
  | { type: "typeQuestion"; value: string }
  | { type: "answered"; result: AskNotebookResultDto };

export const initialReadState: ReadState = {
  sourceId: null,
  kind: "quiz",
  answers: {},
  revealed: {},
  flipped: {},
  results: {},
  shownBlanks: {},
  question: "",
  asked: null,
};

export function readReducer(state: ReadState, event: ReadEvent): ReadState {
  switch (event.type) {
    case "pickSource":
      return state.sourceId === event.sourceId ? state : { ...state, sourceId: event.sourceId };
    case "pickKind":
      return state.kind === event.kind ? state : { ...state, kind: event.kind };
    case "typeAnswer":
      return { ...state, answers: { ...state.answers, [event.practiceId]: event.value } };
    case "reveal":
      return { ...state, revealed: { ...state.revealed, [event.practiceId]: true } };
    case "flip":
      return {
        ...state,
        flipped: { ...state.flipped, [event.practiceId]: !state.flipped[event.practiceId] },
      };
    case "rate":
      if (!state.revealed[event.practiceId]) return state;
      return { ...state, results: { ...state.results, [event.practiceId]: event.result } };
    case "showBlank":
      return { ...state, shownBlanks: { ...state.shownBlanks, [event.practiceId]: true } };
    case "typeQuestion":
      return { ...state, question: event.value };
    case "answered":
      return { ...state, asked: event.result };
  }
}
