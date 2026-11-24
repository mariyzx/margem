import { describe, expect, it } from "vitest";
import { buildCsp } from "./headers";

describe("buildCsp", () => {
  it("omits unsafe-inline and unsafe-eval from script-src in production", () => {
    const csp = buildCsp("abc123", false);
    expect(csp).toContain("script-src 'self' 'nonce-abc123' 'strict-dynamic'");
    expect(csp).not.toContain("'unsafe-eval'");
    expect(csp).toContain("frame-ancestors 'none'");
  });

  it("allows relative /api path without throwing", () => {
    const csp = buildCsp("abc123", false, "/api");
    expect(csp).toContain("connect-src 'self'");
  });
});
