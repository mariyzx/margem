import { ServiceUnavailableException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { TerminusModule } from "@nestjs/terminus";
import { describe, expect, it } from "vitest";
import { PrismaService } from "../prisma/prisma.service";
import { HealthController } from "./health.controller";
import { PrismaHealthIndicator } from "./prisma.health";
import { REDIS_CLIENT, RedisHealthIndicator } from "./redis.health";

describe("HealthController", () => {
  function createModule(opts?: { redisOk?: boolean; dbOk?: boolean }) {
    const redisOk = opts?.redisOk ?? true;
    const dbOk = opts?.dbOk ?? true;

    return Test.createTestingModule({
      imports: [TerminusModule],
      controllers: [HealthController],
      providers: [
        {
          provide: REDIS_CLIENT,
          useValue: {
            ping: async () => {
              if (!redisOk) throw new Error("Redis connection refused");
              return "PONG";
            },
          },
        },
        {
          provide: PrismaService,
          useValue: {
            $queryRaw: async () => {
              if (!dbOk) throw new Error("Database connection refused");
              return [{ "?column?": 1 }];
            },
          },
        },
        RedisHealthIndicator,
        PrismaHealthIndicator,
      ],
    }).compile();
  }

  it("returns ok on /health/live", async () => {
    const moduleRef = await createModule();
    expect(moduleRef.get(HealthController).live()).toEqual({ status: "ok" });
  });

  it("returns 200 on /health/ready when Redis and database respond", async () => {
    const moduleRef = await createModule();
    const result = await moduleRef.get(HealthController).ready();
    expect(result.status).toBe("ok");
  });

  it("throws 503 on /health/ready when Redis fails", async () => {
    const moduleRef = await createModule({ redisOk: false });
    await expect(moduleRef.get(HealthController).ready()).rejects.toThrow(
      ServiceUnavailableException,
    );
  });

  it("throws 503 on /health/ready when database fails", async () => {
    const moduleRef = await createModule({ dbOk: false });
    await expect(moduleRef.get(HealthController).ready()).rejects.toThrow(
      ServiceUnavailableException,
    );
  });
});
