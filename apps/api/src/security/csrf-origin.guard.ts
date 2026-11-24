import {
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
} from "@nestjs/common";
import type { Request } from "express";

export const ALLOWED_ORIGIN = Symbol("ALLOWED_ORIGIN");

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

@Injectable()
export class CsrfOriginGuard implements CanActivate {
  private readonly logger = new Logger(CsrfOriginGuard.name);
  private readonly allowedOrigin: string;

  constructor(@Inject(ALLOWED_ORIGIN) appUrl: string) {
    this.allowedOrigin = new URL(appUrl).origin;
  }

  canActivate(context: ExecutionContext): boolean {
    const req = context.switchToHttp().getRequest<Request>();
    if (SAFE_METHODS.has(req.method.toUpperCase())) {
      return true;
    }

    const origin = req.headers.origin;
    if (typeof origin === "string" && origin.length > 0) {
      if (origin === this.allowedOrigin) {
        return true;
      }
      this.logger.warn(
        { expectedOrigin: this.allowedOrigin, receivedOrigin: origin, path: req.url },
        "security.csrf_blocked",
      );
      throw new ForbiddenException("Invalid request origin");
    }

    const referer = req.headers.referer;
    if (typeof referer === "string" && referer.length > 0) {
      try {
        if (new URL(referer).origin === this.allowedOrigin) {
          return true;
        }
      } catch {
        this.logger.warn(
          { expectedOrigin: this.allowedOrigin, path: req.url },
          "security.csrf_blocked",
        );
        throw new ForbiddenException("Invalid request referer");
      }
      this.logger.warn(
        { expectedOrigin: this.allowedOrigin, path: req.url },
        "security.csrf_blocked",
      );
      throw new ForbiddenException("Invalid request referer");
    }

    // Se houver cookie na requisição mutável sem Origin/Referer, bloqueia
    if (typeof req.headers.cookie === "string" && req.headers.cookie.length > 0) {
      this.logger.warn(
        { expectedOrigin: this.allowedOrigin, path: req.url },
        "security.csrf_blocked",
      );
      throw new ForbiddenException("Missing origin for cookie-authenticated request");
    }

    return true;
  }
}
