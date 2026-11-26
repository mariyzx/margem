import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
} from "@nestjs/common";
import type { Request } from "express";
import { SecurityEventsService } from "../observability/security-events.service";
import { clientFingerprint } from "./client-fingerprint";
import { routeLabel } from "./route-label";

export const ALLOWED_ORIGIN = Symbol("ALLOWED_ORIGIN");

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

type CsrfReason = "foreign_origin" | "foreign_referer" | "invalid_referer" | "missing_origin";

@Injectable()
export class CsrfOriginGuard implements CanActivate {
  private readonly allowedOrigin: string;

  constructor(
    @Inject(ALLOWED_ORIGIN) appUrl: string,
    private readonly securityEvents: SecurityEventsService,
  ) {
    this.allowedOrigin = new URL(appUrl).origin;
  }

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<Request>();
    if (SAFE_METHODS.has(req.method.toUpperCase())) {
      return true;
    }

    const origin = req.headers.origin;
    if (typeof origin === "string" && origin.length > 0) {
      if (origin === this.allowedOrigin) {
        return true;
      }
      return this.block(context, req, "foreign_origin", "Invalid request origin");
    }

    const referer = req.headers.referer;
    if (typeof referer === "string" && referer.length > 0) {
      let refererOrigin: string;
      try {
        refererOrigin = new URL(referer).origin;
      } catch {
        return this.block(context, req, "invalid_referer", "Invalid request referer");
      }
      if (refererOrigin === this.allowedOrigin) {
        return true;
      }
      return this.block(context, req, "foreign_referer", "Invalid request referer");
    }

    // Se houver cookie na requisição mutável sem Origin/Referer, bloqueia
    if (typeof req.headers.cookie === "string" && req.headers.cookie.length > 0) {
      return this.block(
        context,
        req,
        "missing_origin",
        "Missing origin for cookie-authenticated request",
      );
    }

    return true;
  }

  private async block(
    context: ExecutionContext,
    req: Request,
    reason: CsrfReason,
    message: string,
  ): Promise<never> {
    await this.securityEvents.report("csrf_blocked", {
      route: routeLabel(context),
      ipHash: clientFingerprint(req).ipHash,
      reason,
    });
    throw new ForbiddenException(message);
  }
}
