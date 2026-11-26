import { Injectable, Logger } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import { PrismaService } from "../prisma/prisma.service";
import { withAuditContext } from "../security/request-context";

/**
 * Writes AuditLog entries that are not part of a business transaction (failed logins,
 * link requests). Best effort: a failed write is logged and swallowed, so auditing can
 * never break the flow it observes. ipHash/userAgent come from the current request.
 */
@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  async record(
    action: string,
    options: { userId?: string; metadata?: Prisma.InputJsonValue } = {},
  ): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: withAuditContext({
          action,
          userId: options.userId ?? null,
          ...(options.metadata !== undefined ? { metadata: options.metadata } : {}),
        }),
      });
    } catch (error) {
      this.logger.error(
        { action, err: error instanceof Error ? error.message : "unknown" },
        "audit.write_failed",
      );
    }
  }
}
