import { SetMetadata } from "@nestjs/common";
import type { PolicyAction, PolicyRequirement, PolicySubject } from "./policy.types";

export const POLICY_METADATA_KEY = "margem:policy";

export function RequirePolicy(action: PolicyAction, subject: PolicySubject) {
  const requirement: PolicyRequirement = { action, subject };
  return SetMetadata(POLICY_METADATA_KEY, requirement);
}
