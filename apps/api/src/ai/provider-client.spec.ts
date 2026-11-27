import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  AiProviderClient,
  AiProviderError,
  classifyStatus,
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

    const result = await client.complete(groq, MESSAGES, { json: true });

    expect(result).toEqual({ text: '{"ok":true}', tokensIn: 12, tokensOut: 3 });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("https://api.groq.com/openai/v1/chat/completions");
    expect((init?.headers as Record<string, string>).Authorization).toBe(`Bearer ${KEY}`);
    expect(JSON.parse(init?.body as string)).toMatchObject({
      model: groq.model,
      messages: MESSAGES,
      response_format: { type: "json_object" },
    });
  });

  it("sends no Authorization header to the local model", async () => {
    vi.stubEnv("OLLAMA_URL", "http://ollama:11434/");
    fetchMock.mockResolvedValueOnce(
      jsonResponse(200, { choices: [{ message: { content: "oi" } }] }),
    );

    const local = localTarget()!;
    const result = await client.complete(local, MESSAGES, { json: false });

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
    await expect(client.complete(groq, MESSAGES, { json: true })).rejects.toMatchObject({ kind });
  });

  it("never carries the response body or the key in the error", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(401, { error: { message: `Invalid API Key ${KEY}`, prompt: "pergunta" } }),
    );
    const error = await client.complete(groq, MESSAGES, { json: true }).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AiProviderError);
    expect(String(error)).not.toContain(KEY);
    expect(String(error)).not.toContain("pergunta");
  });

  it("reports a timeout as its own kind", async () => {
    fetchMock.mockRejectedValueOnce(Object.assign(new Error("aborted"), { name: "TimeoutError" }));
    await expect(client.complete(groq, MESSAGES, { json: true })).rejects.toMatchObject({
      kind: "timeout",
    });
  });

  it("treats a network failure or an answer without text as a provider error", async () => {
    fetchMock.mockRejectedValueOnce(new TypeError("fetch failed"));
    await expect(client.complete(groq, MESSAGES, { json: true })).rejects.toMatchObject({
      kind: "provider_error",
    });
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { choices: [] }));
    await expect(client.complete(groq, MESSAGES, { json: true })).rejects.toMatchObject({
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
});
