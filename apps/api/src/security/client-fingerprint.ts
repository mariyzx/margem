import { createHmac } from "node:crypto";
import { isIPv4, isIPv6 } from "node:net";
import type { Request } from "express";
import { envSchema } from "../config/env";

export const USER_AGENT_MAX_LENGTH = 200;
const HASH_HEX_LENGTH = 16;

/** Only for development and tests; loadEnv() refuses to start production without the real key. */
const DEV_LOG_HASH_SECRET = "margem-dev-only-log-hash-secret-do-not-use";

const hashEnvSchema = envSchema.pick({ NODE_ENV: true, LOG_HASH_SECRET: true });

function logHashSecret(): string {
  const env = hashEnvSchema.parse(process.env);
  if (env.LOG_HASH_SECRET) {
    return env.LOG_HASH_SECRET;
  }
  if (env.NODE_ENV === "production") {
    throw new Error("LOG_HASH_SECRET is required in production");
  }
  return DEV_LOG_HASH_SECRET;
}

/**
 * Keyed hash for values that must be correlatable in logs and AuditLog but never stored
 * in clear (IP, e-mail). HMAC instead of a plain hash: the IPv4 space is small enough to
 * brute-force a bare SHA-256, but not without the key.
 */
export function hashForLogs(value: string): string {
  return createHmac("sha256", logHashSecret())
    .update(value)
    .digest("hex")
    .slice(0, HASH_HEX_LENGTH);
}

function expandIpv6(ip: string): string[] {
  const [head = "", tail] = ip.split("::");
  const left = head ? head.split(":") : [];
  const right = tail ? tail.split(":") : [];
  const missing = tail === undefined ? 0 : 8 - left.length - right.length;
  return [...left, ...Array<string>(missing).fill("0"), ...right].map((group) =>
    group.padStart(4, "0"),
  );
}

/**
 * IPv4 as is; IPv6 reduced to its /64, since one client usually owns a whole /64 and
 * rotating inside it would otherwise look like many clients.
 */
export function normalizeIpForFingerprint(rawIp: string): string {
  const ip = rawIp.split("%")[0]!.toLowerCase();
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/.exec(ip);
  if (mapped) {
    return mapped[1]!;
  }
  if (isIPv4(ip)) {
    return ip;
  }
  if (isIPv6(ip)) {
    return `${expandIpv6(ip).slice(0, 4).join(":")}::/64`;
  }
  return "unknown";
}

export interface ClientFingerprint {
  ipHash: string;
  userAgent: string | null;
}

type RequestLike = Pick<Request, "ip" | "headers">;

/** Pseudonymous client identity for logs and AuditLog. Never returns the raw IP. */
export function clientFingerprint(req: RequestLike): ClientFingerprint {
  const header = req.headers["user-agent"];
  const userAgent = typeof header === "string" && header.length > 0 ? header : null;
  return {
    ipHash: hashForLogs(normalizeIpForFingerprint(req.ip ?? "")),
    userAgent: userAgent ? userAgent.slice(0, USER_AGENT_MAX_LENGTH) : null,
  };
}
