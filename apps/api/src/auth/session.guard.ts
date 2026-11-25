import { type CanActivate, type ExecutionContext, Injectable } from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import { POLICY_METADATA_KEY } from "../policies/require-policy.decorator";
import type { PolicyRequirement } from "../policies/policy.types";
import { AuthService } from "./auth.service";
import { type AuthenticatedRequest, SESSION_COOKIE_NAME, SESSION_TOKEN_PATTERN } from "./session";

/**
 * Resolves the session cookie into `req.user`. It replaces the old SessionMiddleware,
 * which ran before every guard and hit Postgres even for requests the throttler would
 * reject. As a guard registered after the throttlers (see GLOBAL_GUARDS), a request
 * that gets 429 never reaches the database. It also only looks the session up on
 * routes that declare @RequirePolicy, the only ones that read `req.user`.
 *
 * It never rejects: PolicyGuard, right after it, decides between 401 and access.
 */
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly authService: AuthService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requirement = this.reflector.getAllAndOverride<PolicyRequirement | undefined>(
      POLICY_METADATA_KEY,
      [context.getHandler(), context.getClass()],
    );
    if (!requirement) {
      return true;
    }

    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = (req.cookies as Record<string, unknown> | undefined)?.[SESSION_COOKIE_NAME];
    if (typeof token === "string" && SESSION_TOKEN_PATTERN.test(token)) {
      const found = await this.authService.findSessionUser(token);
      if (found) {
        req.user = found.user;
        req.sessionId = found.sessionId;
      }
    }
    return true;
  }
}
