import * as Sentry from "@sentry/nestjs";
import type { ErrorEvent } from "@sentry/nestjs";
import type { Env } from "../config/env";

const SENSITIVE_HEADERS = new Set([
  "authorization",
  "cookie",
  "set-cookie",
  "x-forwarded-for",
  "x-real-ip",
]);

export function scrubSentryEvent(event: ErrorEvent): ErrorEvent {
  if (event.request?.headers) {
    const cleaned: Record<string, string> = {};
    for (const [key, value] of Object.entries(event.request.headers)) {
      if (!SENSITIVE_HEADERS.has(key.toLowerCase()) && typeof value === "string") {
        cleaned[key] = value;
      }
    }
    event.request.headers = cleaned;
  }

  if (event.request) {
    delete event.request.cookies;
    delete event.request.data;
  }

  if (event.user) {
    delete event.user.email;
    delete event.user.ip_address;
  }

  return event;
}

export function initApiSentry(env: Env): void {
  if (!env.SENTRY_DSN) {
    return;
  }

  Sentry.init({
    dsn: env.SENTRY_DSN,
    environment: env.NODE_ENV,
    release: env.APP_VERSION,
    beforeSend(event) {
      return scrubSentryEvent(event);
    },
  });
}
