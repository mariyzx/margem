import { createHash, randomBytes } from "node:crypto";
import { Inject, Injectable, Logger, UnauthorizedException } from "@nestjs/common";
import type { Prisma } from "@prisma/client";
import type Redis from "ioredis";
import type { AuthUser } from "@margem/shared";
import { loadEnv } from "../config/env";
import { REDIS_CLIENT } from "../health/redis.health";
import { PolicyService } from "../policies/policy.service";
import { PrismaService } from "../prisma/prisma.service";
import { incrementWithTtl } from "../security/redis-counter";
import { normalizeEmailForRateLimit } from "./email-rate-limit-key";
import { MailerService } from "./mailer.service";
import { AuditService } from "../observability/audit.service";
import { SecurityEventsService } from "../observability/security-events.service";
import { hashForLogs } from "../security/client-fingerprint";
import { withAuditContext } from "../security/request-context";

const MAGIC_LINK_TTL_MS = 15 * 60 * 1000;
const MAGIC_LINK_EMAIL_LIMIT = 5;
const MAGIC_LINK_EMAIL_WINDOW_SEC = 3600;
const MAGIC_LINK_EMAIL_COOLDOWN_SEC = 60;
const MAGIC_LINK_GLOBAL_KEY_TTL_SEC = 48 * 3600;
const GLOBAL_CAP_LOG_INTERVAL_SEC = 3600;
const GOOGLE_OAUTH_TTL_SEC = 600;

export interface MagicLinkRequestResponse {
  ok: true;
  message: string;
}

function magicLinkRequestResponse(): MagicLinkRequestResponse {
  return { ok: true, message: "Se o endereço existir, enviamos um link de acesso." };
}

export type MagicLinkOutcome = "sent" | "email_limited" | "global_cap";
export type MagicLinkVerifyFailure = "invalid" | "expired" | "used";
export type GoogleFailureReason = "state_mismatch" | "email_not_verified" | "token_invalid";

/** Google OAuth failure with the reason recorded in AuditLog (`auth.google_failed`). */
export class GoogleAuthError extends UnauthorizedException {
  constructor(
    readonly reason: GoogleFailureReason,
    message: string,
  ) {
    super(message);
  }
}

export function hashToken(rawToken: string): string {
  return createHash("sha256").update(rawToken).digest("hex");
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly mailer: MailerService,
    private readonly policy: PolicyService,
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly audit: AuditService,
    private readonly securityEvents: SecurityEventsService,
  ) {}

  async requestMagicLink(email: string): Promise<MagicLinkRequestResponse> {
    // Every early return below sends the same body as a successful request, so the
    // response never tells whether an address exists or was rate-limited.
    if (!(await this.consumeEmailQuota(email))) {
      await this.recordMagicLinkRequest(email, "email_limited");
      return magicLinkRequestResponse();
    }
    if (!(await this.consumeGlobalDailyQuota())) {
      await this.recordMagicLinkRequest(email, "global_cap");
      return magicLinkRequestResponse();
    }

    const rawToken = randomBytes(32).toString("base64url");
    const tokenHash = hashToken(rawToken);
    const now = new Date();
    const expiresAt = new Date(now.getTime() + MAGIC_LINK_TTL_MS);

    await this.prisma.$transaction(async (tx) => {
      await tx.magicLinkToken.updateMany({
        where: { email, usedAt: null, expiresAt: { gt: now } },
        data: { usedAt: now },
      });
      await tx.magicLinkToken.create({
        data: { email, tokenHash, expiresAt },
      });
    });

    const env = loadEnv();
    const magicUrl = `${env.APP_URL}/entrar/verificar?token=${encodeURIComponent(rawToken)}`;
    await this.mailer.sendMagicLink(email, magicUrl);
    await this.recordMagicLinkRequest(email, "sent");

    return magicLinkRequestResponse();
  }

  /** AuditLog + daily counter. The e-mail is only stored as an HMAC. */
  private async recordMagicLinkRequest(email: string, outcome: MagicLinkOutcome): Promise<void> {
    await this.securityEvents.count(`magic_link.${outcome}`);
    await this.audit.record("auth.magic_link_requested", {
      metadata: { emailHash: hashForLogs(email.trim().toLowerCase()), outcome },
    });
  }

  /** Cooldown between sends, then the hourly cap, both keyed by the normalized address. */
  private async consumeEmailQuota(email: string): Promise<boolean> {
    const emailKey = hashToken(normalizeEmailForRateLimit(email));

    const cooldown = await this.redis.set(
      `auth:magic:cooldown:${emailKey}`,
      "1",
      "EX",
      MAGIC_LINK_EMAIL_COOLDOWN_SEC,
      "NX",
    );
    if (cooldown === null) {
      return false;
    }

    const { count } = await incrementWithTtl(
      this.redis,
      `auth:magic:email:${emailKey}`,
      MAGIC_LINK_EMAIL_WINDOW_SEC * 1000,
    );
    return count <= MAGIC_LINK_EMAIL_LIMIT;
  }

  private async consumeGlobalDailyQuota(): Promise<boolean> {
    const cap = loadEnv().MAGIC_LINK_DAILY_CAP;
    const day = new Date().toISOString().slice(0, 10);

    const { count } = await incrementWithTtl(
      this.redis,
      `auth:magic:global:${day}`,
      MAGIC_LINK_GLOBAL_KEY_TTL_SEC * 1000,
    );
    if (count <= cap) {
      return true;
    }

    const firstInHour = await this.redis.set(
      "auth:magic:global_cap_logged",
      "1",
      "EX",
      GLOBAL_CAP_LOG_INTERVAL_SEC,
      "NX",
    );
    if (firstInHour !== null) {
      this.logger.warn({ cap, day }, "auth.magic_link_global_cap_reached");
    }
    return false;
  }

  async verifyMagicLink(
    rawToken: string,
  ): Promise<{ user: AuthUser; sessionToken: string; expiresAt: Date }> {
    try {
      return await this.consumeMagicLink(rawToken);
    } catch (error) {
      if (error instanceof UnauthorizedException) {
        // Recorded outside the rolled-back transaction, so the failure is not lost.
        const reason = await this.verifyFailureReason(hashToken(rawToken));
        await this.securityEvents.count(`magic_link_verify_failed.${reason}`);
        await this.audit.record("auth.magic_link_verify_failed", { metadata: { reason } });
      }
      throw error;
    }
  }

  private async verifyFailureReason(tokenHash: string): Promise<MagicLinkVerifyFailure> {
    try {
      const token = await this.prisma.magicLinkToken.findUnique({
        where: { tokenHash },
        select: { usedAt: true, expiresAt: true },
      });
      if (!token) return "invalid";
      if (token.usedAt) return "used";
      if (token.expiresAt <= new Date()) return "expired";
      return "used"; // consumed concurrently by another request
    } catch {
      return "invalid";
    }
  }

  private async consumeMagicLink(
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

      await this.createSessionWithinLimit(tx, user.id, sessionHash, sessionExpiresAt);

      await tx.auditLog.create({
        data: withAuditContext({
          userId: user.id,
          action: "auth.login",
          metadata: { method: "magic_link" },
        }),
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

  async startGoogleOAuth(): Promise<{ url: string; state: string }> {
    const env = loadEnv();
    if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET || !env.GOOGLE_REDIRECT_URI) {
      throw new UnauthorizedException("Google OAuth is not configured");
    }

    const state = randomBytes(32).toString("base64url");
    const codeVerifier = randomBytes(32).toString("base64url");
    const codeChallenge = createHash("sha256").update(codeVerifier).digest("base64url");

    await this.redis.set(`auth:oauth:google:${state}`, codeVerifier, "EX", GOOGLE_OAUTH_TTL_SEC);

    const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
    url.searchParams.set("client_id", env.GOOGLE_CLIENT_ID);
    url.searchParams.set("redirect_uri", env.GOOGLE_REDIRECT_URI);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", "openid email profile");
    url.searchParams.set("state", state);
    url.searchParams.set("code_challenge", codeChallenge);
    url.searchParams.set("code_challenge_method", "S256");

    return { url: url.toString(), state };
  }

  async completeGoogleOAuth(params: {
    code: string;
    state: string;
  }): Promise<{ user: AuthUser; sessionToken: string; expiresAt: Date }> {
    const env = loadEnv();
    if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET || !env.GOOGLE_REDIRECT_URI) {
      throw new UnauthorizedException("Google OAuth is not configured");
    }

    const stateKey = `auth:oauth:google:${params.state}`;
    const codeVerifier = await this.redis.get(stateKey);
    if (!codeVerifier) {
      throw new GoogleAuthError("state_mismatch", "Invalid or expired OAuth state");
    }
    await this.redis.del(stateKey);

    const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code: params.code,
        client_id: env.GOOGLE_CLIENT_ID,
        client_secret: env.GOOGLE_CLIENT_SECRET,
        redirect_uri: env.GOOGLE_REDIRECT_URI,
        grant_type: "authorization_code",
        code_verifier: codeVerifier,
      }),
    });

    if (!tokenRes.ok) {
      throw new GoogleAuthError("token_invalid", "Failed to exchange Google OAuth code");
    }

    const tokenData = (await tokenRes.json()) as { access_token?: string };
    if (!tokenData.access_token) {
      throw new GoogleAuthError("token_invalid", "Missing Google access token");
    }

    const userInfoRes = await fetch("https://openidconnect.googleapis.com/v1/userinfo", {
      headers: { Authorization: `Bearer ${tokenData.access_token}` },
    });

    if (!userInfoRes.ok) {
      throw new GoogleAuthError("token_invalid", "Failed to fetch Google user profile");
    }

    const profile = (await userInfoRes.json()) as {
      sub?: string;
      email?: string;
      email_verified?: boolean;
      name?: string;
      picture?: string;
    };

    if (!profile.sub || !profile.email || profile.email_verified !== true) {
      throw new GoogleAuthError("email_not_verified", "Google account email is not verified");
    }

    const sessionToken = randomBytes(32).toString("base64url");
    const sessionHash = hashToken(sessionToken);
    const sessionExpiresAt = new Date(Date.now() + env.SESSION_TTL_DAYS * 24 * 60 * 60 * 1000);
    const email = profile.email.toLowerCase();

    return this.prisma.$transaction(async (tx) => {
      const existingAccount = await tx.authAccount.findUnique({
        where: {
          provider_providerAccountId: {
            provider: "google",
            providerAccountId: profile.sub!,
          },
        },
        include: { user: true },
      });

      let user = existingAccount?.user;

      if (!user) {
        user = await tx.user.upsert({
          where: { email },
          update: {
            ...(profile.name ? { name: profile.name } : {}),
            ...(profile.picture ? { avatarUrl: profile.picture } : {}),
          },
          create: {
            email,
            name: profile.name ?? null,
            avatarUrl: profile.picture ?? null,
          },
        });

        await tx.authAccount.create({
          data: {
            userId: user.id,
            provider: "google",
            providerAccountId: profile.sub!,
          },
        });
      }

      await this.createSessionWithinLimit(tx, user.id, sessionHash, sessionExpiresAt);

      await tx.auditLog.create({
        data: withAuditContext({
          userId: user.id,
          action: "auth.login",
          metadata: { method: "google" },
        }),
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

  /**
   * Creates the session and, if the user now has more active sessions than
   * MAX_ACTIVE_SESSIONS_PER_USER, revokes the oldest ones in the same transaction.
   */
  private async createSessionWithinLimit(
    tx: Prisma.TransactionClient,
    userId: string,
    tokenHash: string,
    expiresAt: Date,
  ): Promise<void> {
    const now = new Date();
    await tx.session.create({ data: { userId, tokenHash, expiresAt } });

    const overflow = await tx.session.findMany({
      where: { userId, revokedAt: null, expiresAt: { gt: now } },
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      skip: loadEnv().MAX_ACTIVE_SESSIONS_PER_USER,
      select: { id: true },
    });
    if (overflow.length > 0) {
      await tx.session.updateMany({
        where: { id: { in: overflow.map((session) => session.id) } },
        data: { revokedAt: now },
      });
    }
  }

  async recordGoogleFailure(reason: GoogleFailureReason): Promise<void> {
    await this.securityEvents.count(`google_failed.${reason}`);
    await this.audit.record("auth.google_failed", { metadata: { reason } });
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
        data: withAuditContext({ userId, action: "auth.logout" }),
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
        data: withAuditContext({ userId, action: "auth.logout_all" }),
      });
    });
  }
}
