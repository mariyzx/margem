import { Injectable, Logger } from "@nestjs/common";
import * as Sentry from "@sentry/nestjs";
import type { AiFeatures, AiUnavailableReason, AiUsageFeature } from "@margem/shared";
import type { ZodType } from "zod";
import { PrismaService } from "../prisma/prisma.service";
import { AiUnavailableException } from "./ai-errors";
import { AiRateLimit } from "./ai-rate-limit";
import { AiSettingsService, credentialContext } from "./ai-settings.service";
import { CredentialCipherError, decryptCredential, loadMasterKey } from "./credential-cipher";
import { buildMessages, type PromptSpec } from "./prompt";
import {
  AiProviderClient,
  AiProviderError,
  type AiProviderId,
  type ChatMessage,
  type CompletionResult,
  type ProviderFailure,
  localTarget,
  remoteTarget,
  type ProviderTarget,
} from "./provider-client";
import { parseStructured } from "./structured-output";

const FEATURE_TOGGLE: Record<AiUsageFeature, keyof AiFeatures | null> = {
  "suggest-clozes-questions": "suggestClozesQuestions",
  "grade-answer": "gradeAnswers",
  "explain-after-error": "explainAfterError",
  "ask-notebook": "askNotebook",
  "memory-gaps": null,
  "generate-practice": null,
};

const LOCAL_ATTEMPTS = 2;
const LOCAL_MAX_PENDING = 4;
const TRANSIENT_RETRY_DELAY_MS = 500;

export interface AiResult<T> {
  data: T;
  provider: AiProviderId;
}

@Injectable()
export class AiService {
  private readonly logger = new Logger(AiService.name);
  private localQueue: Promise<unknown> = Promise.resolve();
  private localPending = 0;

  constructor(
    private readonly prisma: PrismaService,
    private readonly settings: AiSettingsService,
    private readonly providers: AiProviderClient,
    private readonly rateLimit: AiRateLimit,
  ) {}

  completeJson<T>(
    userId: string,
    feature: AiUsageFeature,
    prompt: PromptSpec,
    schema: ZodType<T>,
  ): Promise<AiResult<T>> {
    return this.run(userId, feature, buildMessages(prompt), true, (text) =>
      parseStructured(text, schema),
    );
  }

  completeText(
    userId: string,
    feature: Extract<AiUsageFeature, "explain-after-error" | "ask-notebook">,
    prompt: PromptSpec,
  ): Promise<AiResult<string>> {
    return this.run(userId, feature, buildMessages(prompt), false, (text) => {
      const trimmed = text.trim();
      return trimmed.length > 0 ? trimmed : null;
    });
  }

  async assertEnabled(userId: string, feature: AiUsageFeature): Promise<void> {
    const settings = await this.settings.preferences(userId);
    if (!settings.enabled) throw new AiUnavailableException("disabled");
    const toggle = FEATURE_TOGGLE[feature];
    if (toggle && !settings.features[toggle]) throw new AiUnavailableException("feature_disabled");
  }

  private async run<T>(
    userId: string,
    feature: AiUsageFeature,
    messages: ChatMessage[],
    json: boolean,
    parse: (text: string) => T | null,
  ): Promise<AiResult<T>> {
    await this.assertEnabled(userId, feature);
    await this.rateLimit.consume(userId);

    const targets = await this.targetsFor(userId);
    if (targets.length === 0) throw new AiUnavailableException("no_provider");

    let lastReason: AiUnavailableReason = "provider_error";
    for (const target of targets) {
      const attempts = target.id === "local" ? LOCAL_ATTEMPTS : 1;
      for (let attempt = 1; attempt <= attempts; attempt++) {
        let result: CompletionResult;
        try {
          result = await this.call(target, messages, json, feature);
        } catch (error) {
          if (!(error instanceof AiProviderError)) throw error;
          await this.recordUsage(userId, feature, target.id, null, false);
          this.logger.warn(
            { provider: target.id, feature, kind: error.kind, status: error.status },
            "ai.provider_failed",
          );
          lastReason = error.kind;
          break;
        }

        const parsed = parse(result.text);
        await this.recordUsage(userId, feature, target.id, result, parsed !== null);
        if (parsed !== null) {
          if (target !== targets[0]) {
            this.logger.warn({ provider: target.id, feature }, "ai.fallback_used");
          }
          return { data: parsed, provider: target.id };
        }
        this.logger.warn({ provider: target.id, feature, attempt }, "ai.invalid_output");
        lastReason = "invalid_output";
      }
    }
    throw new AiUnavailableException(lastReason);
  }

  private async targetsFor(userId: string): Promise<ProviderTarget[]> {
    const rows = await this.prisma.aiCredential.findMany({
      where: { userId },
      select: { provider: true, encryptedKey: true },
      orderBy: { createdAt: "asc" },
    });

    const targets: ProviderTarget[] = [];
    if (rows.length > 0) {
      let masterKey: Buffer | null = null;
      try {
        masterKey = loadMasterKey();
      } catch {
        this.logger.warn("ai.master_key_missing");
      }
      for (const row of masterKey ? rows : []) {
        try {
          const apiKey = decryptCredential(
            row.encryptedKey,
            credentialContext(userId, row.provider),
            masterKey!,
          );
          targets.push(remoteTarget(row.provider, apiKey));
        } catch (error) {
          if (!(error instanceof CredentialCipherError)) throw error;
          this.logger.warn({ provider: row.provider }, "ai.credential_unreadable");
        }
      }
    }

    const local = localTarget();
    if (local) targets.push(local);
    return targets;
  }

  private call(
    target: ProviderTarget,
    messages: ChatMessage[],
    json: boolean,
    feature: AiUsageFeature,
  ): Promise<CompletionResult> {
    const attempt = () =>
      Sentry.startSpan(
        {
          name: "ai.complete",
          op: "ai.complete",
          attributes: { "ai.provider": target.id, "ai.model": target.model, "ai.feature": feature },
        },
        async (span) => {
          const result = await this.withTransientRetry(() =>
            this.providers.complete(target, messages, { json }),
          );
          span.setAttribute("ai.tokens_in", result.tokensIn);
          span.setAttribute("ai.tokens_out", result.tokensOut);
          return result;
        },
      );

    if (target.id !== "local") return attempt();
    if (this.localPending >= LOCAL_MAX_PENDING) {
      return Promise.reject(new AiProviderError("timeout"));
    }
    this.localPending++;
    const queued = this.localQueue.then(attempt, attempt).finally(() => {
      this.localPending--;
    });
    this.localQueue = queued.catch(() => undefined);
    return queued;
  }

  private async withTransientRetry(fn: () => Promise<CompletionResult>): Promise<CompletionResult> {
    try {
      return await fn();
    } catch (error) {
      if (!(error instanceof AiProviderError) || !isTransient(error.kind)) throw error;
      await new Promise((resolve) => setTimeout(resolve, TRANSIENT_RETRY_DELAY_MS));
      return fn();
    }
  }

  private async recordUsage(
    userId: string,
    feature: AiUsageFeature,
    provider: AiProviderId,
    result: CompletionResult | null,
    ok: boolean,
  ): Promise<void> {
    try {
      await this.prisma.aiUsage.create({
        data: {
          userId,
          feature,
          provider,
          tokensIn: result?.tokensIn ?? 0,
          tokensOut: result?.tokensOut ?? 0,
          ok,
        },
      });
    } catch (error) {
      this.logger.warn(
        { error: error instanceof Error ? error.message : String(error) },
        "ai.usage_write_failed",
      );
    }
  }
}

function isTransient(kind: ProviderFailure): boolean {
  return kind === "provider_error";
}
