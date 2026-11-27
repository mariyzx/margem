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

type RequestWithUser = Request & { user?: AuthenticatedUser };
type CredentialRow = {
  userId: string;
  provider: string;
  encryptedKey: string;
  keyLast4: string;
  createdAt: Date;
};

const GROQ_KEY_A = "gsk_user_a_secret_key_AAAA";

/**
 * In-memory stand-in for the two tables, shared by every user of the test app. It filters
 * by the `where` it receives, so a service that forgot `userId` would leak here too.
 */
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

  beforeEach(async () => {
    vi.stubEnv("AI_KEYS_MASTER_KEY", randomBytes(32).toString("base64"));
    store = makeFakePrisma();
    const moduleRef = await Test.createTestingModule({
      controllers: [AiSettingsController],
      providers: [
        AiSettingsService,
        PolicyService,
        { provide: PrismaService, useValue: store.prisma },
        { provide: APP_GUARD, useClass: PolicyGuard },
      ],
    }).compile();
    app = moduleRef.createNestApplication();
    // Stands in for SessionGuard: the test picks who is signed in through a header.
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
});
