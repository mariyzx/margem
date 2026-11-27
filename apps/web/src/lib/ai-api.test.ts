import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AiCredentialError,
  ApiError,
  finishOpenRouterConnection,
  OpenRouterConnectError,
  startOpenRouterConnection,
  checkMemoryGapsWithAi,
  explainAnswer,
  gradeAnswers,
  fetchAiSettings,
  removeAiCredential,
  saveGroqKey,
  updateAiSettings,
} from "./api";

const KEY = `gsk_${"w".repeat(24)}`;
const SETTINGS = {
  enabled: true,
  promptTarget: "chatgpt",
  features: {
    suggestClozesQuestions: true,
    gradeAnswers: true,
    explainAfterError: true,
    askNotebook: true,
  },
  credentials: [],
};

function respond(status: number, body: unknown) {
  return new Response(body === undefined ? null : JSON.stringify(body), { status });
}

describe("AI settings client", () => {
  const fetchMock = vi.fn<typeof fetch>();
  afterEach(() => {
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  function stub(status: number, body?: unknown) {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockResolvedValueOnce(respond(status, body));
  }

  it("reads and validates the settings", async () => {
    stub(200, { settings: SETTINGS });
    await expect(fetchAiSettings()).resolves.toEqual(SETTINGS);
    expect(fetchMock.mock.calls[0]![1]).toMatchObject({ method: "GET", credentials: "include" });
  });

  it("sends only what changed on update", async () => {
    stub(200, { settings: { ...SETTINGS, enabled: false } });
    await updateAiSettings({ features: { askNotebook: false } });
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toMatch(/\/ai\/settings$/);
    expect(init).toMatchObject({ method: "PUT", body: '{"features":{"askNotebook":false}}' });
  });

  it("saves a Groq key and gets back only the last 4 characters", async () => {
    stub(201, {
      credential: { provider: "groq", keyLast4: "wwww", createdAt: "2026-11-27T12:00:00.000Z" },
    });
    await expect(saveGroqKey(KEY)).resolves.toMatchObject({ keyLast4: "wwww" });
    expect(JSON.parse(fetchMock.mock.calls[0]![1]!.body as string)).toEqual({
      provider: "groq",
      apiKey: KEY,
    });
  });

  it.each([
    [400, { code: "invalid_key" }, "invalid_key"],
    [503, { code: "provider_unreachable" }, "provider_unreachable"],
    [
      503,
      { message: "ai_keys_unavailable", error: "Service Unavailable", statusCode: 503 },
      "keys_unavailable",
    ],
    [500, { message: "boom" }, "unknown"],
    [400, undefined, "unknown"],
  ])("maps a %i answer to %s", async (status, body, reason) => {
    stub(status, body);
    const error = await saveGroqKey(KEY).catch((e: unknown) => e);
    expect(error).toBeInstanceOf(AiCredentialError);
    expect((error as AiCredentialError).reason).toBe(reason);
    expect(String(error)).not.toContain(KEY);
  });

  it("treats removing an already removed key as done", async () => {
    stub(404, { message: "Resource not found" });
    await expect(removeAiCredential("groq")).resolves.toBeUndefined();
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toMatch(/\/ai\/credentials\/groq$/);
    expect(init).toMatchObject({ method: "DELETE" });
  });
});

describe("grading and explanation client", () => {
  const fetchMock = vi.fn<typeof fetch>();
  afterEach(() => {
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  it("grades every written answer in a single request", async () => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockResolvedValueOnce(
      respond(200, {
        results: [
          { questionId: "q1", verdict: "partial", missing: ["ordem"] },
          { questionId: "q2", verdict: "right", missing: [] },
        ],
      }),
    );

    const results = await gradeAnswers([
      { questionId: "q1", answer: "entrega" },
      { questionId: "q2", answer: "ordem" },
    ]);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(results.map((result) => result.verdict)).toEqual(["partial", "right"]);
  });

  it("sends the attempt and returns the explanation text", async () => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockResolvedValueOnce(respond(200, { explanation: "Pense no relógio." }));

    await expect(explainAnswer("q1", "tentei")).resolves.toBe("Pense no relógio.");
    expect(JSON.parse(fetchMock.mock.calls[0]![1]!.body as string)).toEqual({ answer: "tentei" });
  });

  it("carries the ai_unavailable reason", async () => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockResolvedValueOnce(respond(503, { code: "ai_unavailable", reason: "timeout" }));

    const error = await explainAnswer("q1", "x").catch((e: unknown) => e);
    expect((error as ApiError).aiUnavailable).toBe("timeout");
  });
});

describe("memory gaps with AI client", () => {
  const fetchMock = vi.fn<typeof fetch>();
  afterEach(() => {
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  it("posts the note id and reads points tied to source excerpts", async () => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockResolvedValueOnce(
      respond(200, {
        hasMemoryText: true,
        gaps: [{ point: "Faltou: janela.", chunkId: "c1", ord: 0, page: 3, excerpt: "janela" }],
      }),
    );

    const result = await checkMemoryGapsWithAi("n1");

    expect(result.gaps[0]?.point).toBe("Faltou: janela.");
    expect(fetchMock.mock.calls[0]![1]).toMatchObject({ method: "POST", body: '{"noteId":"n1"}' });
  });

  it("carries the ai_unavailable reason so the panel can fall back", async () => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockResolvedValueOnce(respond(503, { code: "ai_unavailable", reason: "quota" }));

    const error = await checkMemoryGapsWithAi("n1").catch((e: unknown) => e);
    expect((error as ApiError).aiUnavailable).toBe("quota");
  });
});

describe("OpenRouter connection client", () => {
  const fetchMock = vi.fn<typeof fetch>();
  afterEach(() => {
    vi.unstubAllGlobals();
    fetchMock.mockReset();
  });

  it("only follows an authorization URL on openrouter.ai", async () => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockResolvedValueOnce(
      respond(200, { url: "https://openrouter.ai/auth?code_challenge=x&state=y" }),
    );
    await expect(startOpenRouterConnection()).resolves.toMatch(/^https:\/\/openrouter\.ai\/auth/);

    fetchMock.mockResolvedValueOnce(respond(200, { url: "https://evil.example/auth" }));
    await expect(startOpenRouterConnection()).rejects.toBeInstanceOf(OpenRouterConnectError);
  });

  it("finishes with state and code and gets back only the last 4 characters", async () => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockResolvedValueOnce(
      respond(201, {
        credential: {
          provider: "openrouter",
          keyLast4: "ZZZZ",
          createdAt: "2026-11-27T12:00:00.000Z",
        },
      }),
    );

    await expect(finishOpenRouterConnection("state-1", "code-1")).resolves.toMatchObject({
      keyLast4: "ZZZZ",
    });
    expect(JSON.parse(fetchMock.mock.calls[0]![1]!.body as string)).toEqual({
      state: "state-1",
      code: "code-1",
    });
  });

  it.each([
    [400, { code: "oauth_state_invalid" }, "oauth_state_invalid"],
    [400, { code: "oauth_code_invalid" }, "oauth_code_invalid"],
    [503, { code: "provider_unreachable" }, "provider_unreachable"],
    [500, { message: "boom" }, "unknown"],
  ])("maps a %i answer to %s", async (status, body, reason) => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockResolvedValueOnce(respond(status, body));
    const error = await finishOpenRouterConnection("s", "c").catch((e: unknown) => e);
    expect((error as OpenRouterConnectError).reason).toBe(reason);
  });

  it("reports an expired session as a 401 so the page can send the person to sign in", async () => {
    vi.stubGlobal("fetch", fetchMock);
    fetchMock.mockResolvedValueOnce(respond(401, { message: "Authentication required" }));
    const error = await finishOpenRouterConnection("s", "c").catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(401);
  });
});
