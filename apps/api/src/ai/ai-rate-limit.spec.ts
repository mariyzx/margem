import type Redis from "ioredis";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AiUnavailableException } from "./ai-errors";
import { AiRateLimit } from "./ai-rate-limit";

function fakeRedis(failing = false) {
  const counts = new Map<string, number>();
  return {
    counts,
    redis: {
      multi() {
        let key = "";
        const chain = {
          incr(k: string) {
            key = k;
            return chain;
          },
          pexpire() {
            return chain;
          },
          pttl() {
            return chain;
          },
          async exec() {
            if (failing) throw new Error("connection refused");
            const count = (counts.get(key) ?? 0) + 1;
            counts.set(key, count);
            return [
              [null, count],
              [null, 1],
              [null, 60_000],
            ];
          },
        };
        return chain;
      },
    } as unknown as Redis,
  };
}

describe("AiRateLimit", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("allows up to the limit per user and answers 429 above it", async () => {
    vi.stubEnv("AI_CALLS_PER_MINUTE_PER_USER", "2");
    const { redis, counts } = fakeRedis();
    const limit = new AiRateLimit(redis);

    await limit.consume("user-a");
    await limit.consume("user-a");
    const error = await limit.consume("user-a").catch((e: unknown) => e);

    expect(error).toBeInstanceOf(AiUnavailableException);
    expect((error as AiUnavailableException).getStatus()).toBe(429);
    expect((error as AiUnavailableException).getResponse()).toEqual({
      code: "ai_unavailable",
      reason: "rate_limited",
    });
    await expect(limit.consume("user-b")).resolves.toBeUndefined();
    expect([...counts.keys()]).toEqual(["ai:calls:user-a", "ai:calls:user-b"]);
  });

  it("fails open when Redis is down", async () => {
    const { redis } = fakeRedis(true);
    await expect(new AiRateLimit(redis).consume("user-a")).resolves.toBeUndefined();
  });
});
