import { randomBytes } from "node:crypto";
import type { INestApplication } from "@nestjs/common";
import { APP_GUARD } from "@nestjs/core";
import { Test } from "@nestjs/testing";
import type { NextFunction, Request, Response } from "express";
import request from "supertest";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PolicyGuard } from "../policies/policy.guard";
import { PolicyService } from "../policies/policy.service";
import type { AuthenticatedUser } from "../policies/policy.types";
import { PrismaService } from "../prisma/prisma.service";
import { AiSettingsController } from "./ai-settings.controller";
import { AiSettingsService } from "./ai-settings.service";
import { REDIS_CLIENT } from "../health/redis.health";
import { OpenRouterOAuthService } from "./openrouter-oauth.service";
import { AiProviderClient, AiProviderError } from "./provider-client";

type RequestWithUser = Request & { user?: AuthenticatedUser };
type CredentialRow = {
  userId: string;
  provider: string;
  encryptedKey: string;
  keyLast4: string;
  createdAt: Date;
};

const GROQ_KEY_A = "gsk_user_a_secret_key_AAAA";
const OPENROUTER_KEY = `sk-or-v1-${"o".repeat(24)}ZZZZ`;

function makeFakePrisma() {
  const settings = new Map<string, Record<string, unknown>>();
  const credentials: CredentialRow[] = [];
  const pick = (row: CredentialRow, select?: Record<string, boolean>) =>
    select
      ? Object.fromEntries(Object.keys(select).map((k) => [k, row[k as keyof CredentialRow]]))
      : row;
  const matches = (row: CredentialRow, where: Partial<CredentialRow>) =>
    Object.entries(where).every(([k, v]) => row[k as keyof CredentialRow] === v);

  const prisma = {
    aiSettings: {
      upsert: async ({ where, create, update }: Record<string, Record<string, unknown>>) => {
        const userId = where!.userId as string;
        const current = settings.get(userId);
        const next = current
          ? { ...current, ...stripUndefined(update!) }
          : { enabled: true, promptTarget: "chatgpt", features: {}, ...stripUndefined(create!) };
        settings.set(userId, next);
        return next;
      },
      findUnique: async ({ where }: { where: { userId: string } }) =>
        settings.get(where.userId) ?? null,
    },
    aiCredential: {
      findMany: async ({
        where,
        select,
      }: {
        where: Partial<CredentialRow>;
        select?: Record<string, boolean>;
      }) => credentials.filter((row) => matches(row, where)).map((row) => pick(row, select)),
      upsert: async ({
        where,
        create,
        update,
        select,
      }: {
        where: { userId_provider: { userId: string; provider: string } };
        create: Omit<CredentialRow, "createdAt">;
        update: Partial<CredentialRow>;
        select?: Record<string, boolean>;
      }) => {
        const existing = credentials.find((row) => matches(row, where.userId_provider));
        if (existing) {
          Object.assign(existing, update);
          return pick(existing, select);
        }
        const row = { ...create, createdAt: new Date() };
        credentials.push(row);
        return pick(row, select);
      },
      deleteMany: async ({ where }: { where: Partial<CredentialRow> }) => {
        const before = credentials.length;
        for (let i = credentials.length - 1; i >= 0; i--) {
          if (matches(credentials[i]!, where)) credentials.splice(i, 1);
        }
        return { count: before - credentials.length };
      },
    },
    auditLog: { create: async () => ({}) },
  };
  return {
    credentials,
    prisma: Object.assign(prisma, {
      $transaction: async (cb: (tx: unknown) => Promise<unknown>) => cb(prisma),
    }),
  };
}

function stripUndefined(data: Record<string, unknown>) {
  return Object.fromEntries(Object.entries(data).filter(([, v]) => v !== undefined));
}

describe("AI settings routes", () => {
  let app: INestApplication;
  let store: ReturnType<typeof makeFakePrisma>;
  const redisData = new Map<string, string>();
  const redis = {
    set: async (key: string, value: string) => {
      redisData.set(key, value);
      return "OK";
    },
    getdel: async (key: string) => {
      const value = redisData.get(key) ?? null;
      redisData.delete(key);
      return value;
    },
  };
  const providers = {
    testKey: vi.fn(async () => undefined),
    exchangeOpenRouterCode: vi.fn(async (_code: string, _verifier: string) => OPENROUTER_KEY),
  };

  beforeEach(async () => {
    vi.stubEnv("AI_KEYS_MASTER_KEY", randomBytes(32).toString("base64"));
    store = makeFakePrisma();
    const moduleRef = await Test.createTestingModule({
      controllers: [AiSettingsController],
      providers: [
        AiSettingsService,
        PolicyService,
        OpenRouterOAuthService,
        { provide: AiProviderClient, useValue: providers },
        { provide: REDIS_CLIENT, useValue: redis },
        { provide: PrismaService, useValue: store.prisma },
        { provide: APP_GUARD, useClass: PolicyGuard },
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    app.use((req: RequestWithUser, _res: Response, next: NextFunction) => {
      const userId = req.headers["x-test-user"];
      if (typeof userId === "string" && userId) {
        req.user = { id: userId, email: `${userId}@margem.local` };
      }
      next();
    });
    await app.init();
  });

  afterEach(async () => {
    redisData.clear();
    providers.exchangeOpenRouterCode.mockReset();
    providers.exchangeOpenRouterCode.mockImplementation(async () => OPENROUTER_KEY);
    await app.close();
    vi.unstubAllEnvs();
  });

  const as = (userId: string) => ({
    get: (path: string) => request(app.getHttpServer()).get(path).set("x-test-user", userId),
    put: (path: string) => request(app.getHttpServer()).put(path).set("x-test-user", userId),
    post: (path: string) => request(app.getHttpServer()).post(path).set("x-test-user", userId),
    delete: (path: string) => request(app.getHttpServer()).delete(path).set("x-test-user", userId),
  });

  it("requires a session on every route", async () => {
    const server = app.getHttpServer();
    await request(server).get("/ai/settings").expect(401);
    await request(server).put("/ai/settings").send({ enabled: false }).expect(401);
    await request(server)
      .post("/ai/credentials")
      .send({ provider: "groq", apiKey: GROQ_KEY_A })
      .expect(401);
    await request(server).delete("/ai/credentials/groq").expect(401);
  });

  it("returns defaults on first read", async () => {
    const res = await as("user-a").get("/ai/settings").expect(200);
    expect(res.body.settings).toEqual({
      enabled: true,
      promptTarget: "chatgpt",
      features: {
        suggestClozesQuestions: true,
        gradeAnswers: true,
        explainAfterError: true,
        askNotebook: true,
      },
      credentials: [],
    });
  });

  it("saves a Groq key and only ever answers with the last 4 characters", async () => {
    const saved = await as("user-a")
      .post("/ai/credentials")
      .send({ provider: "groq", apiKey: GROQ_KEY_A })
      .expect(201);
    expect(saved.body.credential).toMatchObject({ provider: "groq", keyLast4: "AAAA" });

    const read = await as("user-a").get("/ai/settings").expect(200);
    expect(read.body.settings.credentials).toEqual([
      expect.objectContaining({ provider: "groq", keyLast4: "AAAA" }),
    ]);

    expect(JSON.stringify(saved.body)).not.toContain(GROQ_KEY_A);
    expect(JSON.stringify(read.body)).not.toContain(GROQ_KEY_A);
    expect(JSON.stringify(read.body)).not.toContain(store.credentials[0]!.encryptedKey);
    expect(store.credentials[0]!.encryptedKey).not.toContain(GROQ_KEY_A);
  });

  it("does not echo the pasted key in validation errors", async () => {
    const res = await as("user-a")
      .post("/ai/credentials")
      .send({ provider: "openrouter", apiKey: GROQ_KEY_A })
      .expect(400);
    expect(JSON.stringify(res.body)).not.toContain(GROQ_KEY_A);
  });

  it("user B can neither see nor remove user A's credential", async () => {
    await as("user-a")
      .post("/ai/credentials")
      .send({ provider: "groq", apiKey: GROQ_KEY_A })
      .expect(201);

    const bSettings = await as("user-b").get("/ai/settings").expect(200);
    expect(bSettings.body.settings.credentials).toEqual([]);

    await as("user-b").delete("/ai/credentials/groq").expect(404);
    expect(store.credentials).toHaveLength(1);

    await as("user-a").delete("/ai/credentials/groq").expect(204);
    expect(store.credentials).toHaveLength(0);
  });

  it("keeps each user's settings apart and merges partial updates", async () => {
    await as("user-a")
      .put("/ai/settings")
      .send({ features: { askNotebook: false } })
      .expect(200);
    const res = await as("user-a").put("/ai/settings").send({ enabled: false }).expect(200);
    expect(res.body.settings.enabled).toBe(false);
    expect(res.body.settings.features.askNotebook).toBe(false);
    expect(res.body.settings.features.gradeAnswers).toBe(true);

    const b = await as("user-b").get("/ai/settings").expect(200);
    expect(b.body.settings.enabled).toBe(true);
    expect(b.body.settings.features.askNotebook).toBe(true);
  });

  it.each([{ enable: false }, { features: { unknown: true } }, { promptTarget: "copilot" }])(
    "rejects an invalid settings body: %j",
    async (body) => {
      await as("user-a").put("/ai/settings").send(body).expect(400);
    },
  );

  it("rejects an unknown provider on delete", async () => {
    await as("user-a").delete("/ai/credentials/google").expect(400);
  });

  describe("OpenRouter OAuth", () => {
    async function startAs(userId: string) {
      const res = await as(userId).post("/ai/openrouter/connect").expect(200);
      return new URL(res.body.url as string);
    }

    it("starts PKCE S256 with a state and the settings callback", async () => {
      const url = await startAs("user-a");

      expect(url.origin + url.pathname).toBe("https://openrouter.ai/auth");
      expect(url.searchParams.get("code_challenge_method")).toBe("S256");
      expect(url.searchParams.get("code_challenge")).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(url.searchParams.get("state")).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(url.searchParams.get("callback_url")).toMatch(/\/configuracoes\/ia\/openrouter$/);
      expect(url.toString()).not.toContain("verifier");
    });

    it("exchanges the code with the stored verifier and keeps only the last 4 characters", async () => {
      const url = await startAs("user-a");
      const state = url.searchParams.get("state")!;

      const res = await as("user-a")
        .post("/ai/openrouter/finish")
        .send({ state, code: "code-from-openrouter" })
        .expect(201);

      expect(res.body.credential).toMatchObject({ provider: "openrouter", keyLast4: "ZZZZ" });
      expect(JSON.stringify(res.body)).not.toContain(OPENROUTER_KEY);
      const [code, verifier] = providers.exchangeOpenRouterCode.mock.calls[0]!;
      expect(code).toBe("code-from-openrouter");
      const { createHash } = await import("node:crypto");
      expect(createHash("sha256").update(verifier).digest("base64url")).toBe(
        url.searchParams.get("code_challenge"),
      );
      expect(store.credentials[0]).toMatchObject({ userId: "user-a", provider: "openrouter" });
      expect(store.credentials[0]!.encryptedKey).not.toContain(OPENROUTER_KEY);
    });

    it("uses each state only once", async () => {
      const state = (await startAs("user-a")).searchParams.get("state")!;
      await as("user-a").post("/ai/openrouter/finish").send({ state, code: "c1" }).expect(201);

      const again = await as("user-a")
        .post("/ai/openrouter/finish")
        .send({ state, code: "c2" })
        .expect(400);
      expect(again.body).toMatchObject({ code: "oauth_state_invalid" });
      expect(providers.exchangeOpenRouterCode).toHaveBeenCalledTimes(1);
    });

    it("user B can't finish a connection started by user A", async () => {
      const state = (await startAs("user-a")).searchParams.get("state")!;

      await as("user-b").post("/ai/openrouter/finish").send({ state, code: "c1" }).expect(400);

      expect(providers.exchangeOpenRouterCode).not.toHaveBeenCalled();
      expect(store.credentials).toHaveLength(0);
    });

    it("stores nothing when OpenRouter refuses the code", async () => {
      providers.exchangeOpenRouterCode.mockRejectedValueOnce(
        new AiProviderError("invalid_key", 403),
      );
      const state = (await startAs("user-a")).searchParams.get("state")!;

      const res = await as("user-a")
        .post("/ai/openrouter/finish")
        .send({ state, code: "expired" })
        .expect(400);

      expect(res.body).toMatchObject({ code: "oauth_code_invalid" });
      expect(store.credentials).toHaveLength(0);
    });

    it("answers 503 when OpenRouter can't be reached", async () => {
      providers.exchangeOpenRouterCode.mockRejectedValueOnce(new AiProviderError("timeout"));
      const state = (await startAs("user-a")).searchParams.get("state")!;

      await as("user-a").post("/ai/openrouter/finish").send({ state, code: "c" }).expect(503);
    });

    it("requires a session to start or finish", async () => {
      const server = app.getHttpServer();
      await request(server).post("/ai/openrouter/connect").expect(401);
      await request(server)
        .post("/ai/openrouter/finish")
        .send({ state: "x".repeat(43), code: "c" })
        .expect(401);
    });
  });
});
