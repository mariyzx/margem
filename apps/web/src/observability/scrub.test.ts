import type { ErrorEvent } from "@sentry/nextjs";
import { describe, expect, it } from "vitest";
import { scrubWebSentryEvent } from "./scrub";

describe("scrubWebSentryEvent", () => {
  it("strips request headers, cookies, data and user PII", () => {
    const event: ErrorEvent = {
      type: undefined,
      request: {
        headers: { cookie: "margem_session=123" },
        cookies: { margem_session: "123" },
        data: { email: "a@b.com" },
      },
      user: {
        id: "user-1",
        email: "mari@margem.local",
        ip_address: "10.0.0.1",
      },
    };

    const cleaned = scrubWebSentryEvent(event);
    expect(cleaned.request?.headers).toBeUndefined();
    expect(cleaned.request?.cookies).toBeUndefined();
    expect(cleaned.request?.data).toBeUndefined();
    expect(cleaned.user).toEqual({ id: "user-1" });
  });
});
