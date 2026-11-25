import type { Request } from "express";
import type { AuthUser } from "@margem/shared";

export const SESSION_COOKIE_NAME = "margem_session";

/** Session tokens are 32 random bytes in base64url (43 chars). */
export const SESSION_TOKEN_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export type AuthenticatedRequest = Request & {
  user?: AuthUser;
  sessionId?: string;
};
