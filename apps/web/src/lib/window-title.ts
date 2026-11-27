import { messages } from "../messages/pt-br";

export function windowTitle(noteTitle: string | null): string {
  if (noteTitle === null) return messages.appName;
  const name = noteTitle.trim() || messages.notebooks.untitledNote;
  return `${name} — ${messages.appName}`;
}
