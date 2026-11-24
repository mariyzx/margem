import { Injectable, type NestMiddleware } from "@nestjs/common";
import type { NextFunction, Request, Response } from "express";
import type { AuthUser } from "@margem/shared";
import { AuthService } from "./auth.service";

export const SESSION_COOKIE_NAME = "margem_session";

export type AuthenticatedRequest = Request & {
  user?: AuthUser;
  sessionId?: string;
};

@Injectable()
export class SessionMiddleware implements NestMiddleware {
  constructor(private readonly authService: AuthService) {}

  async use(req: AuthenticatedRequest, _res: Response, next: NextFunction): Promise<void> {
    const token = req.cookies?.[SESSION_COOKIE_NAME];
    if (typeof token === "string" && token.length > 0) {
      const found = await this.authService.findSessionUser(token);
      if (found) {
        req.user = found.user;
        req.sessionId = found.sessionId;
      }
    }
    next();
  }
}
