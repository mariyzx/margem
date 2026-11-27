import { Injectable } from "@nestjs/common";
import { envSchema } from "../config/env";

export type AiProviderId = "local" | "groq" | "openrouter";

export interface ProviderTarget {
  id: AiProviderId;
  baseUrl: string;
  model: string;
  apiKey?: string;
  timeoutMs: number;
}

export interface ChatMessage {
  role: "system" | "user";
  content: string;
}

export interface CompletionResult {
  text: string;
  tokensIn: number;
  tokensOut: number;
}

export type ProviderFailure = "invalid_key" | "quota" | "timeout" | "provider_error";

export class AiProviderError extends Error {
  constructor(
    readonly kind: ProviderFailure,
    readonly status?: number,
  ) {
    super(`AI provider call failed: ${kind}${status ? ` (${status})` : ""}`);
    this.name = "AiProviderError";
  }
}

const REMOTE_BASE_URL = {
  groq: "https://api.groq.com/openai/v1",
  openrouter: "https://openrouter.ai/api/v1",
} as const;

const REMOTE_TIMEOUT_MS = 30_000;
const LOCAL_TIMEOUT_MS = 120_000;
const TEST_TIMEOUT_MS = 10_000;

const targetEnvSchema = envSchema.pick({
  OLLAMA_URL: true,
  OLLAMA_CHAT_MODEL: true,
  GROQ_CHAT_MODEL: true,
  OPENROUTER_CHAT_MODEL: true,
});

export function remoteTarget(id: "groq" | "openrouter", apiKey: string): ProviderTarget {
  const env = targetEnvSchema.parse(process.env);
  return {
    id,
    baseUrl: REMOTE_BASE_URL[id],
    model: id === "groq" ? env.GROQ_CHAT_MODEL : env.OPENROUTER_CHAT_MODEL,
    apiKey,
    timeoutMs: REMOTE_TIMEOUT_MS,
  };
}

export function localTarget(): ProviderTarget | null {
  const env = targetEnvSchema.parse(process.env);
  if (!env.OLLAMA_URL) return null;
  return {
    id: "local",
    baseUrl: `${env.OLLAMA_URL.replace(/\/+$/, "")}/v1`,
    model: env.OLLAMA_CHAT_MODEL,
    timeoutMs: LOCAL_TIMEOUT_MS,
  };
}

export function classifyStatus(status: number): ProviderFailure {
  if (status === 401 || status === 403) return "invalid_key";
  if (status === 402 || status === 429) return "quota";
  return "provider_error";
}

@Injectable()
export class AiProviderClient {
  async complete(
    target: ProviderTarget,
    messages: ChatMessage[],
    options: { json: boolean },
  ): Promise<CompletionResult> {
    const res = await this.request(target, "/chat/completions", target.timeoutMs, {
      method: "POST",
      body: JSON.stringify({
        model: target.model,
        messages,
        temperature: 0.2,
        ...(options.json ? { response_format: { type: "json_object" } } : {}),
      }),
    });

    const data = (await res.json().catch(() => null)) as {
      choices?: Array<{ message?: { content?: unknown } }>;
      usage?: { prompt_tokens?: unknown; completion_tokens?: unknown };
    } | null;
    const text = data?.choices?.[0]?.message?.content;
    if (typeof text !== "string") {
      throw new AiProviderError("provider_error", res.status);
    }
    return {
      text,
      tokensIn: toCount(data?.usage?.prompt_tokens),
      tokensOut: toCount(data?.usage?.completion_tokens),
    };
  }

  async testKey(target: ProviderTarget): Promise<void> {
    const path = target.id === "openrouter" ? "/key" : "/models";
    await this.request(target, path, TEST_TIMEOUT_MS, { method: "GET" });
  }

  async exchangeOpenRouterCode(code: string, codeVerifier: string): Promise<string> {
    const res = await this.request(
      {
        id: "openrouter",
        baseUrl: REMOTE_BASE_URL.openrouter,
        model: "",
        timeoutMs: TEST_TIMEOUT_MS,
      },
      "/auth/keys",
      TEST_TIMEOUT_MS,
      {
        method: "POST",
        body: JSON.stringify({ code, code_verifier: codeVerifier, code_challenge_method: "S256" }),
      },
    );
    const data = (await res.json().catch(() => null)) as { key?: unknown } | null;
    if (typeof data?.key !== "string" || data.key.length === 0) {
      throw new AiProviderError("provider_error", res.status);
    }
    return data.key;
  }

  private async request(
    target: ProviderTarget,
    path: string,
    timeoutMs: number,
    init: { method: "GET" | "POST"; body?: string },
  ): Promise<Response> {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (target.apiKey) {
      headers.Authorization = `Bearer ${target.apiKey}`;
    }

    let res: Response;
    try {
      res = await fetch(`${target.baseUrl}${path}`, {
        ...init,
        headers,
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (error) {
      const timedOut = error instanceof Error && error.name === "TimeoutError";
      throw new AiProviderError(timedOut ? "timeout" : "provider_error");
    }

    if (!res.ok) {
      await res.body?.cancel().catch(() => undefined);
      throw new AiProviderError(classifyStatus(res.status), res.status);
    }
    return res;
  }
}

function toCount(value: unknown): number {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? Math.round(value) : 0;
}
