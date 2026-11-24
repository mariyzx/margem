import type { ErrorEvent } from "@sentry/nestjs";
import { describe, expect, it } from "vitest";
import { scrubSentryEvent } from "./sentry";

describe("scrubSentryEvent", () => {
  it("removes cookies, authorization headers, email and IP address", () => {
    const event: ErrorEvent = {
      type: undefined,
      request: {
        headers: {
          cookie: "margem_session=secret",
          authorization: "Bearer xyz",
          "x-request-id": "req-123",
        },
        cookies: { margem_session: "secret" },
        data: { password: "123" },
      },
      user: {
        id: "user-1",
        email: "mari@margem.local",
        ip_address: "192.168.0.1",
      },
    };

    const scrubbed = scrubSentryEvent(event);
    expect(scrubbed.request?.headers).toEqual({ "x-request-id": "req-123" });
    expect(scrubbed.request?.cookies).toBeUndefined();
    expect(scrubbed.request?.data).toBeUndefined();
    expect(scrubbed.user).toEqual({ id: "user-1" });
  });
});
