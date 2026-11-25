import { Module } from "@nestjs/common";
import { HealthModule } from "../health/health.module";
import { AuthCleanupService } from "./auth-cleanup.service";

@Module({
  imports: [HealthModule],
  providers: [AuthCleanupService],
})
export class MaintenanceModule {}
