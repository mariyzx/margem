import { Inject, Injectable } from "@nestjs/common";
import { ThrottlerException, ThrottlerGuard, type ThrottlerRequest } from "@nestjs/throttler";
import type { Request } from "express";
import { SecurityEventsService } from "../observability/security-events.service";
import { clientFingerprint } from "./client-fingerprint";
import { routeLabel } from "./route-label";

/**
 * ThrottlerGuard that reports every 429 as `security.rate_limited`, with the name of the
 * throttler that fired. `handleRequest` runs once per named throttler, which is the only
 * place where that name is known.
 */
@Injectable()
export class LoggingThrottlerGuard extends ThrottlerGuard {
  // Property injection keeps ThrottlerGuard's own constructor (options, storage, reflector).
  @Inject(SecurityEventsService) private readonly securityEvents!: SecurityEventsService;

  protected override async handleRequest(requestProps: ThrottlerRequest): Promise<boolean> {
    try {
      return await super.handleRequest(requestProps);
    } catch (error) {
      if (error instanceof ThrottlerException) {
        const throttler = requestProps.throttler.name ?? "default";
        const req = requestProps.context.switchToHttp().getRequest<Request>();
        await this.securityEvents.report(
          "rate_limited",
          {
            route: routeLabel(requestProps.context),
            ipHash: clientFingerprint(req).ipHash,
            throttler,
          },
          `rate_limited.${throttler}`,
        );
      }
      throw error;
    }
  }
}
