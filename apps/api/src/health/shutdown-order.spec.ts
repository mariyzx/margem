import type Redis from "ioredis";
import { describe, expect, it, vi } from "vitest";
import { PrismaService } from "../prisma/prisma.service";
import { HealthModule } from "./health.module";

describe("shutdown order", () => {
  it("closes Redis only after the HTTP server, in onApplicationShutdown", async () => {
    const redis = { quit: vi.fn(async () => "OK") };
    const module = new HealthModule(redis as unknown as Redis);

    expect("onModuleDestroy" in module).toBe(false);
    await module.onApplicationShutdown();
    expect(redis.quit).toHaveBeenCalledOnce();
  });

  it("disconnects Prisma only after the HTTP server, in onApplicationShutdown", async () => {
    const disconnect = vi
      .spyOn(PrismaService.prototype, "$disconnect")
      .mockResolvedValue(undefined);
    const prisma = Object.create(PrismaService.prototype) as PrismaService;

    expect(typeof (prisma as unknown as { onModuleDestroy?: unknown }).onModuleDestroy).toBe(
      "undefined",
    );
    await prisma.onApplicationShutdown();
    expect(disconnect).toHaveBeenCalledOnce();
    disconnect.mockRestore();
  });
});
