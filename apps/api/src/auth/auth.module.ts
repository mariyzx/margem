import { Module } from "@nestjs/common";
import { HealthModule } from "../health/health.module";
import { AuthController } from "./auth.controller";
import { AuthService } from "./auth.service";
import { MailerService } from "./mailer.service";
import { SessionMiddleware } from "./session.middleware";

@Module({
  imports: [HealthModule],
  controllers: [AuthController],
  providers: [AuthService, MailerService, SessionMiddleware],
  exports: [AuthService, SessionMiddleware],
})
export class AuthModule {}
