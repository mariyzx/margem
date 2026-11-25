import { Module } from "@nestjs/common";
import { HealthModule } from "../health/health.module";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { MailerService } from "./mailer.service";
import { SessionGuard } from "./session.guard";

@Module({
  imports: [HealthModule],
  controllers: [AuthController],
  providers: [AuthService, MailerService, SessionGuard],
  exports: [AuthService, SessionGuard],
})
export class AuthModule {}
