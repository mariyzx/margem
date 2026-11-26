import { Global, Module } from "@nestjs/common";
import { HealthModule } from "../health/health.module";
import { AuditService } from "./audit.service";
import { SecurityEventsService } from "./security-events.service";

@Global()
@Module({
  imports: [HealthModule],
  providers: [SecurityEventsService, AuditService],
  exports: [SecurityEventsService, AuditService],
})
export class AbuseObservabilityModule {}
