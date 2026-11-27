import { ApiError } from "../../lib/api";
import { messages } from "../../messages/pt-br";

export function unavailableText(error: unknown): string {
  if (error instanceof ApiError && error.aiUnavailable) {
    return messages.studio.read.aiUnavailable[error.aiUnavailable];
  }
  return messages.studio.read.actionError;
}
