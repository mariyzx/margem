import { afterEach, describe, expect, it } from "vitest";
import { loadEnv } from "../config/env";
import { genReqId } from "../config/logger.config";
import { clientFingerprint, hashForLogs, normalizeIpForFingerprint } from "./client-fingerprint";

const req = (ip: string, userAgent?: string) => ({
  ip,
  headers: userAgent === undefined ? {} : { "user-agent": userAgent },
});

describe("clientFingerprint", () => {
  afterEach(() => {
    delete process.env.LOG_HASH_SECRET;
    process.env.NODE_ENV = "test";
  });

  it("returns a 16-hex HMAC of the IP and never the IP itself", () => {
    const fp = clientFingerprint(req("203.0.113.7", "Mozilla/5.0"));

    expect(fp.ipHash).toMatch(/^[0-9a-f]{16}$/);
    expect(JSON.stringify(fp)).not.toContain("203.0.113.7");
    expect(clientFingerprint(req("203.0.113.7")).ipHash).toBe(fp.ipHash);
    expect(clientFingerprint(req("203.0.113.8")).ipHash).not.toBe(fp.ipHash);
  });

  it("depends on LOG_HASH_SECRET, so the hash cannot be rebuilt without the key", () => {
    const withDevKey = hashForLogs("203.0.113.7");
    process.env.LOG_HASH_SECRET = "x".repeat(32);
    expect(hashForLogs("203.0.113.7")).not.toBe(withDevKey);
  });

  it("groups an IPv6 /64 into one client and treats IPv4-mapped addresses as IPv4", () => {
    expect(normalizeIpForFingerprint("2001:db8:abcd:12::1")).toBe("2001:0db8:abcd:0012::/64");
    expect(normalizeIpForFingerprint("2001:DB8:ABCD:12:ffff::9%eth0")).toBe(
      "2001:0db8:abcd:0012::/64",
    );
    expect(normalizeIpForFingerprint("::ffff:198.51.100.4")).toBe("198.51.100.4");
    expect(normalizeIpForFingerprint("not-an-ip")).toBe("unknown");

    const a = clientFingerprint(req("2001:db8:abcd:12::1")).ipHash;
    const b = clientFingerprint(req("2001:db8:abcd:12:aaaa:bbbb:cccc:dddd")).ipHash;
    const other = clientFingerprint(req("2001:db8:abcd:13::1")).ipHash;
    expect(a).toBe(b);
    expect(a).not.toBe(other);
  });

  it("truncates the user agent to 200 characters and keeps null when absent", () => {
    expect(clientFingerprint(req("203.0.113.7", "a".repeat(5000))).userAgent).toHaveLength(200);
    expect(clientFingerprint(req("203.0.113.7")).userAgent).toBeNull();
  });

  it("refuses to hash in production without a key", () => {
    process.env.NODE_ENV = "production";
    expect(() => hashForLogs("x")).toThrow(/LOG_HASH_SECRET/);
  });
});

describe("LOG_HASH_SECRET in loadEnv", () => {
  const base = {
    DATABASE_URL: "postgresql://u:p@localhost:5432/db",
    REDIS_URL: "redis://localhost:6379",
  };

  it("is required in production and must have at least 32 characters", () => {
    expect(() => loadEnv({ ...base, NODE_ENV: "production" })).toThrow(/LOG_HASH_SECRET/);
    expect(() =>
      loadEnv({ ...base, NODE_ENV: "production", LOG_HASH_SECRET: "too-short" }),
    ).toThrow();
    expect(
      loadEnv({ ...base, NODE_ENV: "production", LOG_HASH_SECRET: "k".repeat(32) }).LOG_HASH_SECRET,
    ).toHaveLength(32);
  });

  it("is optional outside production", () => {
    expect(loadEnv({ ...base, NODE_ENV: "development" }).LOG_HASH_SECRET).toBeUndefined();
  });
});

describe("x-request-id", () => {
  const id = (value?: string) =>
    genReqId({ headers: value === undefined ? {} : { "x-request-id": value } });
  const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

  it("keeps a well-formed client id", () => {
    expect(id("abc-12345")).toBe("abc-12345");
    expect(id("A".repeat(64))).toBe("A".repeat(64));
  });

  it("replaces malformed, short, long or missing ids with a new UUID", () => {
    for (const bad of [
      undefined,
      "",
      "short",
      "a".repeat(65),
      "has space 123",
      "x\r\ninjected",
      '{"a":1}',
    ]) {
      expect(id(bad)).toMatch(UUID);
    }
  });
});
