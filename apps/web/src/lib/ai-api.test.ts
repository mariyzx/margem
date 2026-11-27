import { afterEach, describe, expect, it, vi } from "vitest";
import {
  AiCredentialError,
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
