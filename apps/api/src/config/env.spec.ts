import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { loadEnv } from "./env";

/** Minimum variables loadEnv needs to pass; each test adds only what it is checking. */
const BASE_ENV = {
  DATABASE_URL: "postgresql://user:pass@localhost:5432/margem",
  REDIS_URL: "redis://localhost:6379",
};

const PROD_ENV = {
  ...BASE_ENV,
  NODE_ENV: "production",
  LOG_HASH_SECRET: "x".repeat(32),
};

function keyOf(bytes: number): string {
  return randomBytes(bytes).toString("base64");
}

describe("AI_KEYS_MASTER_KEY", () => {
  it("accepts base64 of exactly 32 bytes", () => {
    const key = keyOf(32);
    expect(loadEnv({ ...BASE_ENV, AI_KEYS_MASTER_KEY: key }).AI_KEYS_MASTER_KEY).toBe(key);
  });

  it.each([
    ["a short value", "test"],
    ["31 bytes", keyOf(31)],
    ["33 bytes", keyOf(33)],
    ["a 32-byte hex key (openssl rand -hex 32)", randomBytes(32).toString("hex")],
  ])("rejects %s", (_label, value) => {
    expect(() => loadEnv({ ...BASE_ENV, AI_KEYS_MASTER_KEY: value })).toThrow(/AI_KEYS_MASTER_KEY/);
  });

  it("rejects a valid key with non-base64 characters mixed in", () => {
    const key = keyOf(32);
    const tampered = `${key.slice(0, 10)}!!@@${key.slice(10)}`;
    expect(() => loadEnv({ ...BASE_ENV, AI_KEYS_MASTER_KEY: tampered })).toThrow(
      /AI_KEYS_MASTER_KEY/,
    );
  });

  it.each([
    ["missing", undefined],
    ["empty", ""],
  ])("is optional outside production (%s)", (_label, value) => {
    expect(() => loadEnv({ ...BASE_ENV, AI_KEYS_MASTER_KEY: value })).not.toThrow();
  });

  it("is required in production", () => {
    expect(() => loadEnv({ ...PROD_ENV, AI_KEYS_MASTER_KEY: "" })).toThrow(
      "AI_KEYS_MASTER_KEY is required in production",
    );
  });

  it("boots in production with a valid key", () => {
    expect(() => loadEnv({ ...PROD_ENV, AI_KEYS_MASTER_KEY: keyOf(32) })).not.toThrow();
  });
});
