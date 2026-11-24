import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Req,
  Res,
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import type { Response } from "express";
import { magicLinkRequestSchema, magicLinkVerifySchema } from "@margem/shared";
import { loadEnv } from "../config/env";
import { RequirePolicy } from "../policies/require-policy.decorator";
import { AuthService } from "./auth.service";
import { type AuthenticatedRequest, SESSION_COOKIE_NAME } from "./session.middleware";

@Controller("auth")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post("magic-link")
  @HttpCode(200)
  @Throttle({ default: { limit: 5, ttl: 3_600_000 } })
  requestMagicLink(@Body() body: unknown) {
    const parsed = magicLinkRequestSchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }
    return this.authService.requestMagicLink(parsed.data.email);
  }

  @Post("verify")
  @HttpCode(200)
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  async verify(@Body() body: unknown, @Res({ passthrough: true }) res: Response) {
    const parsed = magicLinkVerifySchema.safeParse(body);
    if (!parsed.success) {
      throw new BadRequestException(parsed.error.flatten());
    }

    const result = await this.authService.verifyMagicLink(parsed.data.token);
    const isProd = loadEnv().NODE_ENV === "production";

    res.cookie(SESSION_COOKIE_NAME, result.sessionToken, {
      httpOnly: true,
      secure: isProd,
      sameSite: "lax",
      path: "/",
      expires: result.expiresAt,
    });

    return { user: result.user };
  }

  @Get("me")
  @RequirePolicy("read", "user")
  me(@Req() req: AuthenticatedRequest) {
    return { user: req.user };
  }

  @Post("logout")
  @HttpCode(200)
  @RequirePolicy("delete", "session")
  async logout(@Req() req: AuthenticatedRequest, @Res({ passthrough: true }) res: Response) {
    if (req.user && req.sessionId) {
      await this.authService.logout(req.user.id, req.sessionId);
    }
    res.clearCookie(SESSION_COOKIE_NAME, { path: "/" });
    return { ok: true };
  }

  @Post("logout-all")
  @HttpCode(200)
  @RequirePolicy("delete", "session")
  async logoutAll(@Req() req: AuthenticatedRequest, @Res({ passthrough: true }) res: Response) {
    if (req.user) {
      await this.authService.logoutAll(req.user.id);
    }
    res.clearCookie(SESSION_COOKIE_NAME, { path: "/" });
    return { ok: true };
  }
}
