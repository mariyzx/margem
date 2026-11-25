import type { ThrottlerGenerateKeyFunction, ThrottlerOptions } from "@nestjs/throttler";

export const DEFAULT_THROTTLER_NAME = "default";
export const GLOBAL_IP_THROTTLER_NAME = "global-ip";

/**
 * Keys the counter by client IP only (the tracker is `req.ip`), so every route
 * shares the same budget. The default throttler keys by class + handler + IP,
 * which makes its limit per route.
 */
export const globalIpGenerateKey: ThrottlerGenerateKeyFunction = (_context, tracker, name) =>
  `${name}:${tracker}`;

export function createThrottlers(
  limits: { defaultPerRoute?: number; globalPerIp?: number } = {},
): ThrottlerOptions[] {
  return [
    { name: DEFAULT_THROTTLER_NAME, ttl: 60_000, limit: limits.defaultPerRoute ?? 60 },
    {
      name: GLOBAL_IP_THROTTLER_NAME,
      ttl: 60_000,
      limit: limits.globalPerIp ?? 300,
      generateKey: globalIpGenerateKey,
    },
  ];
}
