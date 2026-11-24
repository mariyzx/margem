export type PolicyAction = "read" | "create" | "update" | "delete";

export type PolicySubject = "user" | "session" | "notebook" | "note" | "group";

export interface AuthenticatedUser {
  id: string;
  email: string;
}

export interface PolicyRequirement {
  action: PolicyAction;
  subject: PolicySubject;
}
