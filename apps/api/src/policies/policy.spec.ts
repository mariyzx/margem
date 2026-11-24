import { Controller, Delete, Get, Param, Patch, Req } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { Test } from "@nestjs/testing";
import type { NextFunction, Request, Response } from "express";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { PolicyGuard } from "./policy.guard";
import { PolicyService } from "./policy.service";
import type { AuthenticatedUser } from "./policy.types";
import { RequirePolicy } from "./require-policy.decorator";

type RequestWithUser = Request & { user?: AuthenticatedUser };

const RESOURCES = new Map<string, { id: string; userId: string }>([
  ["res-a", { id: "res-a", userId: "user-a" }],
]);

@Controller("test-policies")
class TestPoliciesController {
  constructor(private readonly policy: PolicyService) {}

  @Get(":id")
  @RequirePolicy("read", "session")
  read(@Param("id") id: string, @Req() req: RequestWithUser) {
    const item = RESOURCES.get(id);
    this.policy.assertOwner(req.user?.id ?? "", item?.userId);
    return item;
  }

  @Patch(":id")
  @RequirePolicy("update", "session")
  update(@Param("id") id: string, @Req() req: RequestWithUser) {
    const item = RESOURCES.get(id);
    this.policy.assertOwner(req.user?.id ?? "", item?.userId);
    return { updated: true };
  }

  @Delete(":id")
  @RequirePolicy("delete", "session")
  remove(@Param("id") id: string, @Req() req: RequestWithUser) {
    const item = RESOURCES.get(id);
    this.policy.assertOwner(req.user?.id ?? "", item?.userId);
    return { deleted: true };
  }
}

describe("Authorization policies", () => {
  async function createApp() {
    const moduleRef = await Test.createTestingModule({
      controllers: [TestPoliciesController],
      providers: [PolicyService, { provide: APP_GUARD, useClass: PolicyGuard }],
    }).compile();

    const app = moduleRef.createNestApplication();
    app.use((req: RequestWithUser, _res: Response, next: NextFunction) => {
      const userId = req.headers["x-test-user"];
      if (typeof userId === "string" && userId.length > 0) {
        req.user = { id: userId, email: `${userId}@margem.local` };
      }
      next();
    });

    // Inject Express request cleanly into controller methods for test isolation
    await app.init();
    return app;
  }

  it("rejects unauthenticated requests with 401", async () => {
    const app = await createApp();
    await request(app.getHttpServer()).get("/test-policies/res-a").expect(401);
    await app.close();
  });

  it("returns 404 when another user tries to read, update or delete a resource", async () => {
    const policy = new PolicyService();
    expect(() => policy.assertOwner("user-b", "user-a")).toThrow("Resource not found");
    expect(() => policy.assertOwner("user-a", "user-a")).not.toThrow();
    expect(policy.ownedBy("user-a")).toEqual({ userId: "user-a" });

    const app = await createApp();
    await request(app.getHttpServer())
      .get("/test-policies/res-a")
      .set("x-test-user", "user-b")
      .expect(404);
    await app.close();
  });
});
