import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  AiProviderClient,
  AiProviderError,
  classifyStatus,
  estimateTokens,
  isReasoningModel,
  providerErrorCode,
  REASONING_HEADROOM_TOKENS,
  localTarget,
  remoteTarget,
  type ProviderTarget,
} from "./provider-client";

const KEY = `gsk_${"k".repeat(24)}`;
const MESSAGES = [{ role: "user" as const, content: "pergunta" }];

function jsonResponse(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

describe("AiProviderClient", () => {
  const fetchMock = vi.fn<typeof fetch>();
  const client = new AiProviderClient();
  let groq: ProviderTarget;

  beforeEach(() => {
    vi.stubGlobal("fetch", fetchMock);
    vi.stubEnv("GROQ_CHAT_MODEL", "plain-chat-model");
    groq = remoteTarget("groq", KEY);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.unstubAllEnvs();
    fetchMock.mockReset();
  });

  it("calls the OpenAI-compatible endpoint with the key and JSON mode", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, {
        choices: [{ message: { content: '{"ok":true}' } }],
        usage: { prompt_tokens: 12, completion_tokens: 3 },
      }),
    );

    const result = await client.complete(groq, MESSAGES, { json: true, maxTokens: 500 });

    expect(result).toEqual({ text: '{"ok":true}', tokensIn: 12, tokensOut: 3 });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://api.groq.com/openai/v1/chat/completions");
    expect((init?.headers as Record<string, string>).Authorization).toBe(`Bearer ${KEY}`);
    expect(JSON.parse(init?.body as string)).toMatchObject({
      model: groq.model,
      messages: MESSAGES,
      response_format: { type: "json_object" },
      max_tokens: 500,
    });
  });

  it("lets reasoning models think less and gives them room to answer", async () => {
    vi.stubEnv("GROQ_CHAT_MODEL", "openai/gpt-oss-120b");
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, { choices: [{ message: { content: '{"ok":true}' } }] }),
    );

    await client.complete(remoteTarget("groq", KEY), MESSAGES, { json: true, maxTokens: 500 });

    expect(JSON.parse(fetchMock.mock.calls[0]![1]?.body as string)).toMatchObject({
      model: "openai/gpt-oss-120b",
      reasoning_effort: "low",
      max_tokens: 500 + REASONING_HEADROOM_TOKENS,
    });
  });

  it("does not send reasoning options to ordinary models", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, { choices: [{ message: { content: "{}" } }] }),
    );
    await client.complete(groq, MESSAGES, { json: true, maxTokens: 500 });
    expect(JSON.parse(fetchMock.mock.calls[0]![1]?.body as string)).not.toHaveProperty(
      "reasoning_effort",
    );
  });

  it("sends no Authorization header to the local model", async () => {
    vi.stubEnv("OLLAMA_URL", "http://ollama:11434/");
    vi.stubEnv("OLLAMA_CHAT_ENABLED", "true");
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, { choices: [{ message: { content: "oi" } }] }),
    );

    const local = localTarget()!;
    const result = await client.complete(local, MESSAGES, { json: false, maxTokens: 500 });

    expect(local.baseUrl).toBe("http://ollama:11434/v1");
    expect(result.tokensIn).toBe(0);
    const [, init] = fetchMock.mock.calls[0]!;
    expect(init?.headers).not.toHaveProperty("Authorization");
    expect(JSON.parse(init?.body as string)).not.toHaveProperty("response_format");
  });

  it("has no local target when Ollama is not configured", () => {
    vi.stubEnv("OLLAMA_URL", "");
    expect(localTarget()).toBeNull();
  });

  it("has no local target unless the local chat model is turned on", () => {
    vi.stubEnv("OLLAMA_URL", "http://ollama:11434");
    vi.stubEnv("OLLAMA_CHAT_ENABLED", "false");
    expect(localTarget()).toBeNull();
    vi.stubEnv("OLLAMA_CHAT_ENABLED", "true");
    expect(localTarget()).not.toBeNull();
  });

  it.each([
    [401, "invalid_key"],
    [403, "invalid_key"],
    [402, "quota"],
    [429, "quota"],
    [500, "provider_error"],
    [503, "provider_error"],
  ] as const)("maps HTTP %i to %s", async (status, kind) => {
    expect(classifyStatus(status)).toBe(kind);
    fetchMock.mockResolvedValueOnce(jsonResponse(status, { error: { message: "nope" } }));
    await expect(
      client.complete(groq, MESSAGES, { json: true, maxTokens: 500 }),
    ).rejects.toMatchObject({ kind });
  });

  it("never carries the response body or the key in the error", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(401, { error: { message: `Invalid API Key ${KEY}`, prompt: "pergunta" } }),
    );
    const error = await client
      .complete(groq, MESSAGES, { json: true, maxTokens: 500 })
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AiProviderError);
    expect(String(error)).not.toContain(KEY);
    expect(String(error)).not.toContain("pergunta");
  });

  it("reports a timeout as its own kind", async () => {
    fetchMock.mockRejectedValueOnce(Object.assign(new Error("aborted"), { name: "TimeoutError" }));
    await expect(
      client.complete(groq, MESSAGES, { json: true, maxTokens: 500 }),
    ).rejects.toMatchObject({
      kind: "timeout",
    });
  });

  it("treats a network failure or an answer without text as a provider error", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("fetch failed"));
    await expect(
      client.complete(groq, MESSAGES, { json: true, maxTokens: 500 }),
    ).rejects.toMatchObject({
      kind: "provider_error",
    });
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { choices: [] }));
    await expect(
      client.complete(groq, MESSAGES, { json: true, maxTokens: 500 }),
    ).rejects.toMatchObject({
      kind: "provider_error",
    });
  });

  it("tests a key with an authenticated GET /models", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { data: [] }));
    await client.testKey(groq);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://api.groq.com/openai/v1/models");
    expect(init?.method).toBe("GET");
  });

  it("only accepts free OpenRouter models", async () => {
    const { envSchema } = await import("../config/env");
    const shape = envSchema.shape.OPENROUTER_CHAT_MODEL;
    expect(shape.safeParse("meta-llama/llama-3.3-70b-instruct:free").success).toBe(true);
    expect(shape.safeParse("openai/gpt-5").success).toBe(false);
  });

  it("tests an OpenRouter key on GET /key, which needs a valid key", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { data: { label: "Margem" } }));
    await client.testKey(remoteTarget("openrouter", KEY));
    expect(String(fetchMock.mock.calls[0]![0])).toBe("https://openrouter.ai/api/v1/key");
  });

  it("exchanges an OpenRouter PKCE code for a key", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { key: "sk-or-v1-abc", user_id: "u" }));

    await expect(client.exchangeOpenRouterCode("the-code", "the-verifier")).resolves.toBe(
      "sk-or-v1-abc",
    );
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://openrouter.ai/api/v1/auth/keys");
    expect(init?.method).toBe("POST");
    expect(init?.headers).not.toHaveProperty("Authorization");
    expect(JSON.parse(init?.body as string)).toEqual({
      code: "the-code",
      code_verifier: "the-verifier",
      code_challenge_method: "S256",
    });
  });

  it("fails the exchange when OpenRouter refuses the code or answers without a key", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(403, { error: "Invalid code or code_verifier" }));
    await expect(client.exchangeOpenRouterCode("c", "v")).rejects.toMatchObject({
      kind: "invalid_key",
      status: 403,
    });
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { user_id: "u" }));
    await expect(client.exchangeOpenRouterCode("c", "v")).rejects.toBeInstanceOf(AiProviderError);
  });
});

describe("estimateTokens", () => {
  it("errs on the safe side for Portuguese text", () => {
    const messages = [
      { role: "system" as const, content: "a".repeat(250) },
      { role: "user" as const, content: "b".repeat(2500) },
    ];
    expect(estimateTokens(messages)).toBe(100 + 8 + 1000 + 8);
  });
});

describe("localTarget", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("is off unless the local chat model is turned on", () => {
    vi.stubEnv("OLLAMA_URL", "http://ollama:11434");
    vi.stubEnv("OLLAMA_CHAT_ENABLED", undefined);
    expect(localTarget()).toBeNull();
  });

  it("carries the configured context size, 8192 by default", () => {
    vi.stubEnv("OLLAMA_URL", "http://ollama:11434");
    vi.stubEnv("OLLAMA_CHAT_ENABLED", "true");
    expect(localTarget()?.contextTokens).toBe(8192);
    vi.stubEnv("OLLAMA_CONTEXT_TOKENS", "4096");
    expect(localTarget()?.contextTokens).toBe(4096);
  });
});

describe("providerErrorCode", () => {
  it("keeps only a short identifier from the provider's error body", () => {
    expect(
      providerErrorCode({
        error: {
          code: "json_validate_failed",
          message: "Failed to generate JSON",
          failed_generation: "texto da nota da pessoa",
        },
      }),
    ).toBe("json_validate_failed");
    expect(providerErrorCode({ error: { type: "invalid_request_error" } })).toBe(
      "invalid_request_error",
    );
  });

  it("drops anything that looks like free text or is missing", () => {
    expect(providerErrorCode({ error: { code: "texto livre com espaços" } })).toBeUndefined();
    expect(providerErrorCode({ error: { code: "x".repeat(65) } })).toBeUndefined();
    expect(providerErrorCode(null)).toBeUndefined();
    expect(providerErrorCode({ message: "sem error" })).toBeUndefined();
  });
});

describe("reasoning models", () => {
  it("recognizes the gpt-oss family", () => {
    expect(isReasoningModel("openai/gpt-oss-120b")).toBe(true);
    expect(isReasoningModel("openai/gpt-oss-20b:free")).toBe(true);
    expect(isReasoningModel("qwen2.5:3b")).toBe(false);
    expect(isReasoningModel("llama-3.3-70b-versatile")).toBe(false);
  });
});
