import { randomBytes } from "node:crypto";
import { NotFoundException, ServiceUnavailableException } from "@nestjs/common";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PrismaService } from "../prisma/prisma.service";
import { AiSettingsService, credentialContext } from "./ai-settings.service";
import { decryptCredential } from "./credential-cipher";

const MASTER_KEY = randomBytes(32);
/** Built at runtime and low-entropy on purpose: no key-like literal for the secret scanner. */
const GROQ_KEY = `gsk_${"y".repeat(24)}`;
const CREATED = new Date("2026-11-26T12:00:00Z");

/** Prisma fake: `tx` inside $transaction is the same object, so calls can be asserted. */
function makePrisma() {
  const prisma = {
    aiSettings: {
      upsert: vi.fn(async (_args: unknown) => ({
        userId: "user-a",
        enabled: true,
        promptTarget: "chatgpt",
        features: {},
      })),
      findUnique: vi.fn(async (_args: unknown): Promise<{ features: unknown } | null> => null),
    },
    aiCredential: {
      findMany: vi.fn(async (_args: unknown) => []),
      upsert: vi.fn(async (_args: { create: { encryptedKey: string } }) => ({
        provider: "groq",
        keyLast4: "1234",
        createdAt: CREATED,
      })),
      deleteMany: vi.fn(async (_args: unknown) => ({ count: 1 })),
    },
    auditLog: { create: vi.fn(async (_args: unknown) => ({})) },
  };
  return Object.assign(prisma, {
    $transaction: vi.fn(async (cb: (tx: unknown) => Promise<unknown>) => cb(prisma)),
  });
}

function makeService(prisma: ReturnType<typeof makePrisma>) {
  return new AiSettingsService(prisma as unknown as PrismaService);
}

describe("AiSettingsService", () => {
  beforeEach(() => vi.stubEnv("AI_KEYS_MASTER_KEY", MASTER_KEY.toString("base64")));
  afterEach(() => vi.unstubAllEnvs());

  it("creates settings on first read with every feature on and no credential", async () => {
    const prisma = makePrisma();

    const settings = await makeService(prisma).get("user-a");

    expect(prisma.aiSettings.upsert).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: "user-a" }, create: { userId: "user-a" } }),
    );
    expect(settings.enabled).toBe(true);
    expect(Object.values(settings.features).every(Boolean)).toBe(true);
    expect(settings.credentials).toEqual([]);
  });

  it("reads credentials scoped to the user and never selects the encrypted key", async () => {
    const prisma = makePrisma();

    await makeService(prisma).get("user-a");

    expect(prisma.aiCredential.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { userId: "user-a" },
        select: { provider: true, keyLast4: true, createdAt: true },
      }),
    );
  });

  it("merges features: what was not sent keeps its stored value", async () => {
    const prisma = makePrisma();
    prisma.aiSettings.findUnique.mockResolvedValueOnce({ features: { askNotebook: false } });

    await makeService(prisma).update("user-a", { features: { gradeAnswers: false } });

    expect(prisma.aiSettings.upsert).toHaveBeenCalledWith(
      expect.objectContaining({
        update: expect.objectContaining({
          features: {
            suggestClozesQuestions: true,
            gradeAnswers: false,
            explainAfterError: true,
            askNotebook: false,
          },
        }),
      }),
    );
  });

  it("stores the key encrypted, bound to the user, and audits without the key", async () => {
    const prisma = makePrisma();

    const summary = await makeService(prisma).saveCredential("user-a", {
      provider: "groq",
      apiKey: GROQ_KEY,
    });

    const stored = prisma.aiCredential.upsert.mock.calls[0]?.[0].create.encryptedKey ?? "";
    expect(JSON.stringify(prisma.aiCredential.upsert.mock.calls)).not.toContain(GROQ_KEY);
    expect(decryptCredential(stored, credentialContext("user-a", "groq"), MASTER_KEY)).toBe(
      GROQ_KEY,
    );
    expect(JSON.stringify(prisma.auditLog.create.mock.calls)).not.toContain(GROQ_KEY);
    expect(summary).toEqual({
      provider: "groq",
      keyLast4: "1234",
      createdAt: CREATED.toISOString(),
    });
  });

  it("answers 503 when the master key is not configured", async () => {
    vi.stubEnv("AI_KEYS_MASTER_KEY", "");
    const prisma = makePrisma();

    await expect(
      makeService(prisma).saveCredential("user-a", { provider: "groq", apiKey: GROQ_KEY }),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
    expect(prisma.aiCredential.upsert).not.toHaveBeenCalled();
  });

  it("removes only the caller's credential and answers 404 when there is none", async () => {
    const prisma = makePrisma();
    prisma.aiCredential.deleteMany.mockResolvedValueOnce({ count: 0 });

    await expect(makeService(prisma).removeCredential("user-b", "groq")).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expect(prisma.aiCredential.deleteMany).toHaveBeenCalledWith({
      where: { userId: "user-b", provider: "groq" },
    });
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
  });
});
