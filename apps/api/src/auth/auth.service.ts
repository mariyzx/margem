import { createHash, randomBytes } from "node:crypto";
import { Inject, Injectable, UnauthorizedException } from "@nestjs/common";
import type Redis from "ioredis";
import type { AuthUser } from "@margem/shared";
import { loadEnv } from "../config/env";
import { REDIS_CLIENT } from "../health/redis.health";
import { PolicyService } from "../policies/policy.service";
import { PrismaService } from "../prisma/prisma.service";
import { MailerService } from "./mailer.service";
import { TooManyRequestsException } from "./too-many-requests.exception";

const MAGIC_LINK_TTL_MS = 15 * 60 * 1000;
const MAGIC_LINK_EMAIL_LIMIT = 5;
const MAGIC_LINK_EMAIL_WINDOW_SEC = 3600;

export function hashToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly mailer: MailerService,
    private readonly policy: PolicyService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
  ) {}

  async requestMagicLink(email: string): Promise<{ ok: true; message: string }> {
    const emailKey = `auth:magic:email:${hashToken(email)}`;
    const count = await this.redis.incr(emailKey);
    const ttl = await this.redis.ttl(emailKey);
    if (count === 1 || ttl < 0) {
      await this.redis.expire(emailKey, MAGIC_LINK_EMAIL_WINDOW_SEC);
    }
    if (count > MAGIC_LINK_EMAIL_LIMIT) {
      throw new TooManyRequestsException("Too many magic link requests");
    }

    const rawToken = randomBytes(32).toString("base64url");
    const tokenHash = hashToken(rawToken);
    const expiresAt = new Date(Date.now() + MAGIC_LINK_TTL_MS);

    await this.prisma.magicLinkToken.create({
      data: { email, tokenHash, expiresAt },
    });

    const env = loadEnv();
    const magicUrl = `${env.APP_URL}/entrar/verificar?token=${encodeURIComponent(rawToken)}`;
    await this.mailer.sendMagicLink(email, magicUrl);

    return {
      ok: true,
      message: "Se o endereço existir, enviamos um link de acesso.",
    };
  }

  async verifyMagicLink(
    rawToken: string,
  ): Promise<{ user: AuthUser; sessionToken: string; expiresAt: Date }> {
    const tokenHash = hashToken(rawToken);
    const now = new Date();
    const env = loadEnv();
    const sessionToken = randomBytes(32).toString("base64url");
    const sessionHash = hashToken(sessionToken);
    const sessionExpiresAt = new Date(Date.now() + env.SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);

    return this.prisma.$transaction(async (tx) => {
      const consumed = await tx.magicLinkToken.updateMany({
        where: { tokenHash, usedAt: null, expiresAt: { gt: now } },
        data: { usedAt: now },
      });

      if (consumed.count === 0) {
        throw new UnauthorizedException("Invalid or expired magic link");
      }

      const record = await tx.magicLinkToken.findUnique({ where: { tokenHash } });
      if (!record) {
        throw new UnauthorizedException("Invalid or expired magic link");
      }

      const user = await tx.user.upsert({
        where: { email: record.email },
        update: {},
        create: { email: record.email },
      });

      await tx.session.create({
        data: {
          userId: user.id,
          tokenHash: sessionHash,
          expiresAt: sessionExpiresAt,
        },
      });

      await tx.auditLog.create({
        data: {
          userId: user.id,
          action: "auth.login",
          metadata: { method: "magic_link" },
        },
      });

      return {
        user: {
          id: user.id,
          email: user.email,
          name: user.name,
          avatarUrl: user.avatarUrl,
        },
        sessionToken,
        expiresAt: sessionExpiresAt,
      };
    });
  }

  async findSessionUser(
    rawSessionToken: string,
  ): Promise<{ user: AuthUser; sessionId: string } | null> {
    const tokenHash = hashToken(rawSessionToken);
    const session = await this.prisma.session.findUnique({
      where: { tokenHash },
      include: { user: true },
    });

    if (!session || session.revokedAt !== null || session.expiresAt <= new Date()) {
      return null;
    }

    return {
      sessionId: session.id,
      user: {
        id: session.user.id,
        email: session.user.email,
        name: session.user.name,
        avatarUrl: session.user.avatarUrl,
      },
    };
  }

  async logout(userId: string, sessionId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.session.updateMany({
        where: { id: sessionId, ...this.policy.ownedBy(userId), revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await tx.auditLog.create({
        data: { userId, action: "auth.logout" },
      });
    });
  }

  async logoutAll(userId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      await tx.session.updateMany({
        where: { ...this.policy.ownedBy(userId), revokedAt: null },
        data: { revokedAt: new Date() },
      });
      await tx.auditLog.create({
        data: { userId, action: "auth.logout_all" },
      });
    });
  }
}
