import {
  type CanActivate,
  type ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { Reflector } from "@nestjs/core";
import type { Request } from "express";
import { PolicyService } from "./policy.service";
import type { AuthenticatedUser, PolicyRequirement } from "./policy.types";
import { POLICY_METADATA_KEY } from "./require-policy.decorator";

type RequestWithUser = Request & { user?: AuthenticatedUser };

@Injectable()
export class PolicyGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly policyService: PolicyService,
  ) {}

  canActivate(context: ExecutionContext): boolean {
    const requirement = this.reflector.getAllAndOverride<PolicyRequirement | undefined>(
      POLICY_METADATA_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requirement) {
      return true;
    }

    const req = context.switchToHttp().getRequest<RequestWithUser>();
    if (!req.user?.id) {
      throw new UnauthorizedException("Authentication required");
    }

    return this.policyService.canAccess(req.user, requirement.action, requirement.subject);
  }
}
