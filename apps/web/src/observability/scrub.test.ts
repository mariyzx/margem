import type { Breadcrumb, ErrorEvent } from "@sentry/nextjs";
import { describe, expect, it } from "vitest";
import {
  type TransactionEvent,
  scrubBreadcrumb,
  scrubUrl,
  scrubWebSentryEvent,
  scrubWebSentryTransaction,
} from "./scrub";

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

  it("removes the magic link token from url, query string, transaction and breadcrumbs", () => {
    const event: ErrorEvent = {
      type: undefined,
      transaction: "/entrar/verificar?token=abc",
      request: {
        url: "https://margem.app/entrar/verificar?token=abc",
        query_string: "token=abc",
      },
      breadcrumbs: [
        {
          category: "navigation",
          data: { from: "/entrar", to: "/entrar/verificar?token=abc" },
        },
        {
          category: "fetch",
          data: { url: "/api/auth/verify?token=abc&lang=pt", method: "POST" },
        },
      ],
    };

    const cleaned = scrubWebSentryEvent(event);

    expect(cleaned.request?.url).toBe("https://margem.app/entrar/verificar");
    expect(cleaned.request?.query_string).toBe("");
    expect(cleaned.transaction).toBe("/entrar/verificar");
    expect(cleaned.breadcrumbs?.[0]?.data?.to).toBe("/entrar/verificar");
    expect(cleaned.breadcrumbs?.[1]?.data?.url).toBe("/api/auth/verify?lang=pt");
    expect(JSON.stringify(cleaned)).not.toContain("abc");
  });

  it("removes code and state of the Google callback, in any query string shape", () => {
    const asArray = scrubWebSentryEvent({
      type: undefined,
      request: {
        query_string: [
          ["code", "4/0Ab"],
          ["state", "s3cr3t"],
          ["error", "access_denied"],
        ],
      },
    });
    const asObject = scrubWebSentryEvent({
      type: undefined,
      request: { query_string: { code: "4/0Ab", State: "s3cr3t", page: "1" } },
    });

    expect(asArray.request?.query_string).toEqual([["error", "access_denied"]]);
    expect(asObject.request?.query_string).toEqual({ page: "1" });
  });
});

describe("scrubWebSentryTransaction", () => {
  it("cleans transaction names and request urls", () => {
    const event = {
      type: "transaction",
      transaction: "GET /api/auth/google/callback?code=4/0Ab&state=s3cr3t",
      request: { url: "https://margem.app/api/auth/google/callback?code=4/0Ab&state=s3cr3t" },
    } as TransactionEvent;

    const cleaned = scrubWebSentryTransaction(event);

    expect(cleaned.transaction).toBe("GET /api/auth/google/callback");
    expect(cleaned.request?.url).toBe("https://margem.app/api/auth/google/callback");
  });
});

describe("scrubBreadcrumb", () => {
  it("cleans navigation and fetch breadcrumbs before they are stored", () => {
    const crumb: Breadcrumb = {
      category: "navigation",
      data: { from: "/entrar/verificar?token=abc", to: "/" },
    };
    expect(scrubBreadcrumb(crumb).data).toEqual({ from: "/entrar/verificar", to: "/" });
  });
});

describe("scrubUrl", () => {
  it("keeps URLs without sensitive params untouched", () => {
    expect(scrubUrl("/notes/abc?tab=questions#q1")).toBe("/notes/abc?tab=questions#q1");
    expect(scrubUrl("/entrar")).toBe("/entrar");
  });

  it("cleans URLs the URL constructor would reject, without touching the rest", () => {
    expect(scrubUrl("http://[bad?token=abc")).toBe("http://[bad");
    expect(scrubUrl("/a?Token=1&TOKEN=2&ok=3#frag")).toBe("/a?ok=3#frag");
  });
});
