import type * as Sentry from "@sentry/nextjs";
import type { Breadcrumb, ErrorEvent } from "@sentry/nextjs";

type SentryOptions = NonNullable<Parameters<typeof Sentry.init>[0]>;
/** Not re-exported by @sentry/nextjs; taken from the hook's own signature. */
export type TransactionEvent = Parameters<NonNullable<SentryOptions["beforeSendTransaction"]>>[0];

/** `token` (magic link) and the OAuth callback `code`/`state` must never reach Sentry. */
const SENSITIVE_PARAMS = new Set(["token", "code", "state"]);
const URL_FIELDS = ["url", "from", "to"] as const;

function scrubSearchParams(params: URLSearchParams): void {
  for (const name of [...params.keys()]) {
    if (SENSITIVE_PARAMS.has(name.toLowerCase())) {
      params.delete(name);
    }
  }
}

/**
 * Removes sensitive query params and keeps everything else untouched. Works on absolute
 * URLs, relative paths and transaction names like "GET /path?x=1": only the part between
 * the first "?" and "#" is parsed.
 */
export function scrubUrl(value: string): string {
  const queryStart = value.indexOf("?");
  if (queryStart < 0) {
    return value;
  }
  const hashStart = value.indexOf("#", queryStart);
  const base = value.slice(0, queryStart);
  const query = value.slice(queryStart + 1, hashStart < 0 ? undefined : hashStart);
  const hash = hashStart < 0 ? "" : value.slice(hashStart);

  const params = new URLSearchParams(query);
  scrubSearchParams(params);
  const kept = params.toString();
  return `${base}${kept ? `?${kept}` : ""}${hash}`;
}

type QueryString = NonNullable<ErrorEvent["request"]>["query_string"];

function scrubQueryString(query: QueryString): QueryString {
  if (typeof query === "string") {
    const params = new URLSearchParams(query);
    scrubSearchParams(params);
    return params.toString();
  }
  if (Array.isArray(query)) {
    return query.filter(([name]) => !SENSITIVE_PARAMS.has(String(name).toLowerCase()));
  }
  if (query && typeof query === "object") {
    return Object.fromEntries(
      Object.entries(query).filter(([name]) => !SENSITIVE_PARAMS.has(name.toLowerCase())),
    );
  }
  return query;
}

export function scrubBreadcrumb(breadcrumb: Breadcrumb): Breadcrumb {
  if (breadcrumb.data) {
    for (const field of URL_FIELDS) {
      const value = breadcrumb.data[field];
      if (typeof value === "string") {
        breadcrumb.data[field] = scrubUrl(value);
      }
    }
  }
  if (typeof breadcrumb.message === "string") {
    breadcrumb.message = scrubUrl(breadcrumb.message);
  }
  return breadcrumb;
}

/** URL-related cleanup shared by error and transaction events. */
function scrubUrls<T extends ErrorEvent | TransactionEvent>(event: T): T {
  if (event.request?.url) {
    event.request.url = scrubUrl(event.request.url);
  }
  if (event.request && event.request.query_string !== undefined) {
    event.request.query_string = scrubQueryString(event.request.query_string);
  }
  if (typeof event.transaction === "string") {
    event.transaction = scrubUrl(event.transaction);
  }
  event.breadcrumbs = event.breadcrumbs?.map(scrubBreadcrumb);
  return event;
}

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

  return scrubUrls(event);
}

export function scrubWebSentryTransaction(event: TransactionEvent): TransactionEvent {
  if (event.request) {
    delete event.request.headers;
    delete event.request.cookies;
  }
  return scrubUrls(event);
}
