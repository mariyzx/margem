import { Controller, Get } from "@nestjs/common";
import { HealthCheck, HealthCheckService } from "@nestjs/terminus";
import { PrismaHealthIndicator } from "./prisma.health";
import { RedisHealthIndicator } from "./redis.health";

@Controller("health")
export class HealthController {
  constructor(
    private readonly health: HealthCheckService,
    private readonly redisHealth: RedisHealthIndicator,
    private readonly prismaHealth: PrismaHealthIndicator,
  ) {}

  @Get("live")
  live() {
    return { status: "ok" };
  }

  @Get("ready")
  @HealthCheck()
  ready() {
    return this.health.check([
      () => this.redisHealth.isHealthy("redis"),
      () => this.prismaHealth.isHealthy("database"),
    ]);
  }
}
