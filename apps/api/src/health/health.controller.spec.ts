import { ServiceUnavailableException } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import { TerminusModule } from "@nestjs/terminus";
import { describe, expect, it } from "vitest";
import { HealthController } from "./health.controller";
import { REDIS_CLIENT, RedisHealthIndicator } from "./redis.health";

describe("HealthController", () => {
  it("returns ok on /health/live", async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [TerminusModule],
      controllers: [HealthController],
      providers: [
        { provide: REDIS_CLIENT, useValue: { ping: async () => "PONG" } },
        RedisHealthIndicator,
      ],
    }).compile();

    const controller = moduleRef.get(HealthController);
    expect(controller.live()).toEqual({ status: "ok" });
  });

  it("returns 200 on /health/ready when Redis responds PONG", async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [TerminusModule],
      controllers: [HealthController],
      providers: [
        { provide: REDIS_CLIENT, useValue: { ping: async () => "PONG" } },
        RedisHealthIndicator,
      ],
    }).compile();

    const controller = moduleRef.get(HealthController);
    const result = await controller.ready();
    expect(result.status).toBe("ok");
  });

  it("throws 503 on /health/ready when Redis fails", async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [TerminusModule],
      controllers: [HealthController],
      providers: [
        {
          provide: REDIS_CLIENT,
          useValue: {
            ping: async () => {
              throw new Error("Connection refused");
            },
          },
        },
        RedisHealthIndicator,
      ],
    }).compile();

    const controller = moduleRef.get(HealthController);
    await expect(controller.ready()).rejects.toThrow(ServiceUnavailableException);
  });
});
