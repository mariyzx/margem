import type { ExecutionContext } from "@nestjs/common";

/**
 * Stable route name for logs and counters: `Controller.handler`. Unlike the URL it has
 * no ids or query string, so it groups well and never leaks a token from a query.
 */
export function routeLabel(context: ExecutionContext): string {
  return `${context.getClass().name}.${context.getHandler().name}`;
}
