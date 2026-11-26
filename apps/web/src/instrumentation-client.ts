import * as Sentry from "@sentry/nextjs";
import {
  scrubBreadcrumb,
  scrubWebSentryEvent,
  scrubWebSentryTransaction,
} from "./observability/scrub";

const dsn = process.env.NEXT_PUBLIC_SENTRY_DSN;

if (dsn) {
  Sentry.init({
    dsn,
    environment: process.env.NODE_ENV,
    beforeSend(event) {
      return scrubWebSentryEvent(event);
    },
    beforeSendTransaction(event) {
      return scrubWebSentryTransaction(event);
    },
    beforeBreadcrumb(breadcrumb) {
      return scrubBreadcrumb(breadcrumb);
    },
  });
}
