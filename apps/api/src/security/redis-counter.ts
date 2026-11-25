import type Redis from "ioredis";

export interface CounterResult {
  count: number;
  pttlMs: number;
}

/**
 * Increments `key` and guarantees it carries a TTL, in a single MULTI/EXEC.
 *
 * `PEXPIRE ... NX` only sets the TTL when the key has none, so the window starts on
 * the first hit and is never extended. Running it in the same transaction as INCR
 * means a crash between the two commands can no longer leave a counter without TTL.
 * Requires Redis >= 7.0 (NX flag on PEXPIRE).
 */
export async function incrementWithTtl(
  redis: Redis,
  key: string,
  ttlMs: number,
): Promise<CounterResult> {
  const results = await redis.multi().incr(key).pexpire(key, ttlMs, "NX").pttl(key).exec();
  if (!results) {
    throw new Error("Redis transaction aborted");
  }
  for (const [error] of results) {
    if (error) {
      throw error;
    }
  }
  return { count: Number(results[0]![1]), pttlMs: Number(results[2]![1]) };
}
