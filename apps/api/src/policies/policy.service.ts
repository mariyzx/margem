import { Injectable, NotFoundException } from "@nestjs/common";
import type { AuthenticatedUser, PolicyAction, PolicySubject } from "./policy.types";

@Injectable()
export class PolicyService {
  canAccess(
    user: AuthenticatedUser | undefined,
    _action: PolicyAction,
    _subject: PolicySubject,
  ): boolean {
    return Boolean(user?.id);
  }

  ownedBy(actorId: string): { userId: string } {
    return { userId: actorId };
  }

  assertOwner(actorId: string, ownerId: string | null | undefined): void {
    if (!ownerId || actorId !== ownerId) {
      throw new NotFoundException("Resource not found");
    }
  }
}
