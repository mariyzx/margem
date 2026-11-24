import * as Sentry from "@sentry/nextjs";
import { scrubWebSentryEvent } from "./observability/scrub";

export async function register() {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn || process.env.NEXT_RUNTIME !== "nodejs") {
    return;
  }

  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV,
    beforeSend(event) {
      return scrubWebSentryEvent(event);
    },
  });
}
