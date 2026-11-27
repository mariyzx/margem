import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  CredentialCipherError,
  decryptCredential,
  encryptCredential,
  keyLast4,
} from "./credential-cipher";

const KEY = randomBytes(32);
const CONTEXT = "user_a:groq";
/** Built at runtime and low-entropy on purpose: no key-like literal for the secret scanner. */
const SECRET = `gsk_${"x".repeat(20)}cdef`;

describe("credential cipher", () => {
  it("round-trips a secret", () => {
    const envelope = encryptCredential(SECRET, CONTEXT, KEY);
    expect(decryptCredential(envelope, CONTEXT, KEY)).toBe(SECRET);
  });

  it("produces the v1 envelope and never contains the plaintext", () => {
    const envelope = encryptCredential(SECRET, CONTEXT, KEY);
    expect(envelope).toMatch(/^v1\.[A-Za-z0-9+/=]+\.[A-Za-z0-9+/=]+\.[A-Za-z0-9+/=]+$/);
    expect(envelope).not.toContain(SECRET);
  });

  it("uses a fresh IV every time (same input, different envelopes)", () => {
    const a = encryptCredential(SECRET, CONTEXT, KEY);
    const b = encryptCredential(SECRET, CONTEXT, KEY);
    expect(a).not.toBe(b);
    expect(a.split(".")[1]).not.toBe(b.split(".")[1]);
  });

  it("fails with another master key", () => {
    const envelope = encryptCredential(SECRET, CONTEXT, KEY);
    expect(() => decryptCredential(envelope, CONTEXT, randomBytes(32))).toThrow(
      CredentialCipherError,
    );
  });

  it("fails when the envelope is moved to another user's row (AAD)", () => {
    const envelope = encryptCredential(SECRET, CONTEXT, KEY);
    expect(() => decryptCredential(envelope, "user_b:groq", KEY)).toThrow(CredentialCipherError);
  });

  it("fails when the ciphertext is tampered with (auth tag)", () => {
    const parts = encryptCredential(SECRET, CONTEXT, KEY).split(".");
    const bytes = Buffer.from(parts[3] ?? "", "base64");
    bytes[0] = (bytes[0] ?? 0) ^ 0xff;
    parts[3] = bytes.toString("base64");
    expect(() => decryptCredential(parts.join("."), CONTEXT, KEY)).toThrow(CredentialCipherError);
  });

  it.each(["", "v2.a.b.c", "v1.only.three", "plain-text-key"])(
    "rejects a malformed envelope: %j",
    (envelope) => {
      expect(() => decryptCredential(envelope, CONTEXT, KEY)).toThrow(CredentialCipherError);
    },
  );

  it("never puts key material in the error message", () => {
    const envelope = encryptCredential(SECRET, CONTEXT, KEY);
    try {
      decryptCredential(envelope, "user_b:groq", KEY);
      expect.unreachable();
    } catch (error) {
      expect(String(error)).not.toContain(SECRET);
      expect(String(error)).not.toContain(envelope);
    }
  });

  it("exposes only the last 4 characters", () => {
    expect(keyLast4(SECRET)).toBe("cdef");
  });
});
