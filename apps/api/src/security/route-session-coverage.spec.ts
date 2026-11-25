import { PATH_METADATA, ROUTE_ARGS_METADATA } from "@nestjs/common/constants";
import { RouteParamtypes } from "@nestjs/common/enums/route-paramtypes.enum";
import { DiscoveryModule, DiscoveryService } from "@nestjs/core";
import { Test } from "@nestjs/testing";
import { describe, expect, it } from "vitest";
import { POLICY_METADATA_KEY } from "../policies/require-policy.decorator";

/**
 * Handlers that take the raw request but never read `req.user` / `req.sessionId`.
 * Adding one here is a conscious decision: SessionGuard does not resolve the session
 * for them, so `req.user` stays undefined.
 */
const ALLOWED_WITHOUT_POLICY = new Set(["AuthController.googleCallback"]);

describe("session coverage", () => {
  it("every handler that receives @Req() declares @RequirePolicy, so SessionGuard fills req.user", async () => {
    process.env.DATABASE_URL ??= "postgresql://u:p@localhost:5999/db";
    process.env.REDIS_URL ??= "redis://localhost:6999";
    const { AppModule } = await import("../app.module");

    // compile() only builds the graph: no module init, no DB or Redis connections.
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule, DiscoveryModule],
    }).compile();
    const discovery = moduleRef.get(DiscoveryService);

    const handlersWithReq: string[] = [];
    const missingPolicy: string[] = [];

    for (const wrapper of discovery.getControllers()) {
      const controller = wrapper.metatype as (new (...args: never[]) => unknown) | undefined;
      if (!controller) continue;
      const classPolicy = Reflect.getMetadata(POLICY_METADATA_KEY, controller) as unknown;

      for (const name of Object.getOwnPropertyNames(controller.prototype)) {
        const handler = (controller.prototype as Record<string, unknown>)[name];
        if (name === "constructor" || typeof handler !== "function") continue;
        if (Reflect.getMetadata(PATH_METADATA, handler) === undefined) continue;

        const args = (Reflect.getMetadata(ROUTE_ARGS_METADATA, controller, name) ?? {}) as Record<
          string,
          unknown
        >;
        const takesRequest = Object.keys(args).some((key) =>
          key.startsWith(`${RouteParamtypes.REQUEST}:`),
        );
        if (!takesRequest) continue;

        const id = `${controller.name}.${name}`;
        handlersWithReq.push(id);
        const policy =
          (Reflect.getMetadata(POLICY_METADATA_KEY, handler) as unknown) ?? classPolicy;
        if (!policy && !ALLOWED_WITHOUT_POLICY.has(id)) {
          missingPolicy.push(id);
        }
      }
    }

    // Sanity check that the scan really walked the app's controllers.
    expect(handlersWithReq).toEqual(
      expect.arrayContaining([
        "AuthController.me",
        "AuthController.logout",
        "AuthController.logoutAll",
        "NotebooksController.list",
      ]),
    );
    expect(missingPolicy).toEqual([]);
  });
});
