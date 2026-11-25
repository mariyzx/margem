import {
  BadRequestException,
  Body,
  Controller,
  Get,
  HttpCode,
  Post,
  Query,
  Req,
  Res,
} from "@nestjs/common";
import { Throttle } from "@nestjs/throttler";
import type { Request, Response } from "express";
import { magicLinkRequestSchema, magicLinkVerifySchema } from "@margem/shared";
import { loadEnv } from "../config/env";
import { RequirePolicy } from "../policies/require-policy.decorator";
import { AuthService } from "./auth.service";
import { type AuthenticatedRequest, SESSION_COOKIE_NAME } from "./session";

const OAUTH_STATE_COOKIE_NAME = "margem_oauth_state";

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

  @Get("google")
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  async googleLogin(@Res() res: Response) {
    const env = loadEnv();
    try {
      const { url, state } = await this.authService.startGoogleOAuth();
      res.cookie(OAUTH_STATE_COOKIE_NAME, state, {
        httpOnly: true,
        secure: env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        maxAge: 10 * 60 * 1000,
      });
      res.redirect(url);
    } catch {
      res.redirect(`${env.APP_URL}/entrar?error=google`);
    }
  }

  @Get("google/callback")
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  async googleCallback(
    @Query("code") code: string | undefined,
    @Query("state") state: string | undefined,
    @Query("error") error: string | undefined,
    @Req() req: Request,
    @Res() res: Response,
  ) {
    const env = loadEnv();
    const cookieState = (req.cookies as Record<string, string | undefined> | undefined)?.[
      OAUTH_STATE_COOKIE_NAME
    ];
    res.clearCookie(OAUTH_STATE_COOKIE_NAME, { path: "/" });

    if (error || !code || !state || !cookieState || state !== cookieState) {
      res.redirect(`${env.APP_URL}/entrar?error=google`);
      return;
    }

    try {
      const result = await this.authService.completeGoogleOAuth({ code, state });
      res.cookie(SESSION_COOKIE_NAME, result.sessionToken, {
        httpOnly: true,
        secure: env.NODE_ENV === "production",
        sameSite: "lax",
        path: "/",
        expires: result.expiresAt,
      });
      res.redirect(`${env.APP_URL}/`);
    } catch {
      res.redirect(`${env.APP_URL}/entrar?error=google`);
    }
  }
}
