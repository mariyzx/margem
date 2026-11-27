import type Redis from "ioredis";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FakeRedis } from "../testing/fake-redis";
import { RedisThrottlerStorage } from "./redis-throttler.storage";

describe("RedisThrottlerStorage", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  function setup() {
    const redis = new FakeRedis();
    const storage = new RedisThrottlerStorage(redis as unknown as Redis);
    return { redis, storage };
  }

  it("increments and sets the TTL inside one MULTI with PEXPIRE NX", async () => {
    const { redis, storage } = setup();

    await storage.increment("k1", 60_000, 10, 60_000, "default");

    expect(redis.transactions).toHaveLength(1);
    const [incr, pexpire] = redis.transactions[0]!;
    expect(incr).toEqual({ name: "incr", args: ["throttle:default:k1"] });
    expect(pexpire).toEqual({ name: "pexpire", args: ["throttle:default:k1", 60_000, "NX"] });
    expect(redis.standaloneCalls.map((c) => c.name)).not.toContain("incr");
    expect(redis.standaloneCalls.map((c) => c.name)).not.toContain("pexpire");
  });

  it("never leaves a key without TTL, across throttlers, keys and blocks", async () => {
    const { redis, storage } = setup();

    for (let i = 0; i < 5; i++) {
      await storage.increment("a", 60_000, 2, 30_000, "default");
      await storage.increment("b", 60_000, 300, 60_000, "global-ip");
    }

    expect(redis.keys()).toEqual(
      expect.arrayContaining([
        "throttle:default:a",
        "throttle:block:default:a",
        "throttle:global-ip:b",
      ]),
    );
    expect(redis.keysWithoutTtl()).toEqual([]);
  });

  it("does not extend the window on later hits", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-11-25T12:00:00.000Z"));
    const { redis, storage } = setup();

    await storage.increment("w", 60_000, 10, 60_000, "default");
    vi.setSystemTime(new Date("2026-11-25T12:00:40.000Z"));
    const second = await storage.increment("w", 60_000, 10, 60_000, "default");

    expect(second.totalHits).toBe(2);
    expect(second.timeToExpire).toBe(20);
    expect(await redis.pttl("throttle:default:w")).toBe(20_000);
  });

  it("repairs a legacy counter that was left without TTL", async () => {
    const { redis, storage } = setup();
    redis.seed("throttle:default:legacy", "7");

    const result = await storage.increment("legacy", 60_000, 10, 60_000, "default");

    expect(result.totalHits).toBe(8);
    expect(redis.keysWithoutTtl()).toEqual([]);
  });

  it("blocks once the limit is exceeded and reports the block TTL", async () => {
    const { storage } = setup();

    await storage.increment("x", 60_000, 1, 30_000, "default");
    const over = await storage.increment("x", 60_000, 1, 30_000, "default");
    const whileBlocked = await storage.increment("x", 60_000, 1, 30_000, "default");

    expect(over).toMatchObject({ totalHits: 2, isBlocked: true, timeToBlockExpire: 30 });
    expect(whileBlocked).toMatchObject({ isBlocked: true, totalHits: 2 });
  });

  it("lets the request through when Redis is closed instead of failing it", async () => {
    const closed = {
      pttl: vi.fn(async () => {
        throw new Error("Connection is closed.");
      }),
    };
    const storage = new RedisThrottlerStorage(closed as unknown as Redis);

    await expect(storage.increment("k1", 60_000, 10, 60_000, "default")).resolves.toEqual({
      totalHits: 0,
      timeToExpire: 60,
      isBlocked: false,
      timeToBlockExpire: 0,
    });
  });
});
