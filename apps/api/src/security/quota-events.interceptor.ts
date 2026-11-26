import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
  UnprocessableEntityException,
} from "@nestjs/common";
import { quotaExceededErrorSchema } from "@margem/shared";
import type { Request } from "express";
import { catchError, from, mergeMap, type Observable, throwError } from "rxjs";
import { SecurityEventsService } from "../observability/security-events.service";
import { clientFingerprint } from "./client-fingerprint";
import { routeLabel } from "./route-label";

/**
 * Reports `security.quota_exceeded` when a handler rejects with the 422 of a per-user
 * cap. Done here instead of in assertWithinQuota() so the quota helper stays a plain
 * function with no Redis dependency.
 */
@Injectable()
export class QuotaEventsInterceptor implements NestInterceptor {
  constructor(private readonly securityEvents: SecurityEventsService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    return next.handle().pipe(
      catchError((error: unknown) => {
        const quota =
          error instanceof UnprocessableEntityException
            ? quotaExceededErrorSchema.safeParse(error.getResponse())
            : null;
        if (!quota?.success) {
          return throwError(() => error);
        }
        const req = context.switchToHttp().getRequest<Request>();
        const report = this.securityEvents.report(
          "quota_exceeded",
          {
            route: routeLabel(context),
            ipHash: clientFingerprint(req).ipHash,
            resource: quota.data.resource,
            limit: quota.data.limit,
          },
          `quota_exceeded.${quota.data.resource}`,
        );
        return from(report).pipe(mergeMap(() => throwError(() => error)));
      }),
    );
  }
}
