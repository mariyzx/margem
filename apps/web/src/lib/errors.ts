import { messages } from "../messages/pt-br";
import { ApiError } from "./api";

/**
 * Message to show when a create call fails: the per-user cap message when the API
 * answered 422 quota_exceeded, otherwise the generic `fallback`.
 */
export function createErrorMessage(error: unknown, fallback: string): string {
  if (error instanceof ApiError && error.quota) {
    return messages.quota[error.quota.resource].replace(
      "{limit}",
      error.quota.limit.toLocaleString("pt-BR"),
    );
  }
  return fallback;
}
