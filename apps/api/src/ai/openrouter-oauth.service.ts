import {
  BadRequestException,
  Inject,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from "@nestjs/common";
import type {
  AiCredentialSummary,
  FinishOpenRouterInput,
  OpenRouterConnectFailure,
} from "@margem/shared";
import { createHash, randomBytes } from "node:crypto";
import type Redis from "ioredis";
import { envSchema } from "../config/env";
import { REDIS_CLIENT } from "../health/redis.health";
import { AiSettingsService } from "./ai-settings.service";
import { AiProviderClient, AiProviderError } from "./provider-client";

export const OPENROUTER_AUTH_URL = "https://openrouter.ai/auth";
export const OPENROUTER_CALLBACK_PATH = "/configuracoes/ia/openrouter";
const STATE_TTL_SEC = 600;
const appEnvSchema = envSchema.pick({ APP_URL: true });

interface PendingConnection {
  userId: string;
  verifier: string;
}

@Injectable()
export class OpenRouterOAuthService {
  private readonly logger = new Logger(OpenRouterOAuthService.name);

  constructor(
    @Inject(REDIS_CLIENT) private readonly redis: Redis,
    private readonly providers: AiProviderClient,
    private readonly settings: AiSettingsService,
  ) {}

  async start(userId: string): Promise<{ url: string }> {
    const state = randomBytes(32).toString("base64url");
    const verifier = randomBytes(32).toString("base64url");
    const challenge = createHash("sha256").update(verifier).digest("base64url");
    const pending: PendingConnection = { userId, verifier };
    await this.redis.set(stateKey(state), JSON.stringify(pending), "EX", STATE_TTL_SEC);

    const { APP_URL } = appEnvSchema.parse(process.env);
    const url = new URL(OPENROUTER_AUTH_URL);
    url.searchParams.set(
      "callback_url",
      `${APP_URL.replace(/\/+$/, "")}${OPENROUTER_CALLBACK_PATH}`,
    );
    url.searchParams.set("code_challenge", challenge);
    url.searchParams.set("code_challenge_method", "S256");
    url.searchParams.set("state", state);
    url.searchParams.set("key_label", "Margem");
    return { url: url.toString() };
  }

  async finish(userId: string, input: FinishOpenRouterInput): Promise<AiCredentialSummary> {
    const raw = await this.redis.getdel(stateKey(input.state));
    const pending = parsePending(raw);
    if (!pending || pending.userId !== userId) {
      this.logger.warn(
        { reason: pending ? "other_user" : "missing" },
        "ai.openrouter_state_rejected",
      );
      throw failure(BadRequestException, "oauth_state_invalid");
    }

    let apiKey: string;
    try {
      apiKey = await this.providers.exchangeOpenRouterCode(input.code, pending.verifier);
    } catch (error) {
      if (!(error instanceof AiProviderError)) throw error;
      const rejected =
        error.kind === "invalid_key" || (error.status !== undefined && error.status < 500);
      this.logger.warn({ kind: error.kind, status: error.status }, "ai.openrouter_exchange_failed");
      throw rejected
        ? failure(BadRequestException, "oauth_code_invalid")
        : failure(ServiceUnavailableException, "provider_unreachable");
    }

    return this.settings.storeCredential(userId, "openrouter", apiKey, "oauth");
  }
}

function stateKey(state: string): string {
  return `ai:oauth:openrouter:${state}`;
}

function parsePending(raw: string | null): PendingConnection | null {
  if (!raw) return null;
  try {
    const value = JSON.parse(raw) as Partial<PendingConnection>;
    return typeof value.userId === "string" && typeof value.verifier === "string"
      ? { userId: value.userId, verifier: value.verifier }
      : null;
  } catch {
    return null;
  }
}

function failure(
  Exception: typeof BadRequestException | typeof ServiceUnavailableException,
  code: OpenRouterConnectFailure["code"],
) {
  const body: OpenRouterConnectFailure = { code };
  return new Exception(body);
}
