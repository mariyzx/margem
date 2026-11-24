import type { ErrorEvent } from "@sentry/nextjs";

export function scrubWebSentryEvent(event: ErrorEvent): ErrorEvent {
  if (event.request) {
    delete event.request.headers;
    delete event.request.cookies;
    delete event.request.data;
  }

  if (event.user) {
    delete event.user.email;
    delete event.user.ip_address;
  }

  return event;
}
