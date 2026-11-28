import { type ChildProcess, spawn } from "node:child_process";
import { resolve } from "node:path";
import { expect, type Page, type APIRequestContext, test } from "@playwright/test";
import { type FakeAi, NOTE_TEXT, SOURCE_TEXT, startFakeAi } from "./support/fake-ai-server";

const MAILPIT_URL = process.env.MAILPIT_URL ?? "http://localhost:8025";
const API_URL = process.env.API_URL ?? "http://localhost:3001";
const AI_API_PORT = Number(process.env.E2E_AI_API_PORT ?? 3011);
const AI_API_URL = `http://localhost:${AI_API_PORT}`;
const ROOT = resolve(process.cwd(), "../..");
const FIRST_ROUTE_LOAD = { timeout: 30_000 };

let fakeAi: FakeAi;
let api: ChildProcess;

test.describe.configure({ mode: "serial" });

test.beforeAll(async () => {
  test.setTimeout(90_000);
  fakeAi = await startFakeAi();
  api = spawn(
    process.execPath,
    [`--env-file=${resolve(ROOT, ".env")}`, resolve(ROOT, "apps/api/dist/main.js")],
    {
      cwd: resolve(ROOT, "apps/api"),
      env: {
        ...process.env,
        API_PORT: String(AI_API_PORT),
        OLLAMA_URL: fakeAi.url,
        OLLAMA_CHAT_ENABLED: "true",
        OLLAMA_CHAT_MODEL: "fake-model",
      },
      stdio: "ignore",
    },
  );
  await expect
    .poll(
      async () => {
        const res = await fetch(`${AI_API_URL}/health/ready`).catch(() => null);
        return res?.status ?? 0;
      },
      { timeout: 60_000 },
    )
    .toBe(200);
});

test.afterAll(async () => {
  api?.kill();
  await fakeAi?.close();
});

async function routeApiToAiInstance(page: Page) {
  await page.route(`${API_URL}/**`, async (route) => {
    const url = route.request().url().replace(API_URL, AI_API_URL);
    await route.fulfill({ response: await route.fetch({ url }) });
  });
}

async function signIn(page: Page, request: APIRequestContext, email: string) {
  await page.goto("/");
  await page.getByLabel("E-mail").fill(email);
  await page.getByRole("button", { name: "Enviar link de entrada" }).click();
  await expect(page.getByText("Link enviado", { exact: true })).toBeVisible();

  let magicUrl: string | null = null;
  await expect
    .poll(async () => {
      const list = (await (await request.get(`${MAILPIT_URL}/api/v1/messages`)).json()) as {
        messages: Array<{ ID: string; To: Array<{ Address: string }> }>;
      };
      const match = list.messages.find((m) =>
        m.To.some((to) => to.Address.toLowerCase() === email.toLowerCase()),
      );
      if (!match) return null;
      const message = (await (
        await request.get(`${MAILPIT_URL}/api/v1/message/${match.ID}`)
      ).json()) as { Text: string };
      magicUrl =
        message.Text.match(/https?:\/\/[^\s]+\/entrar\/verificar\?token=[^\s]+/)?.[0] ?? null;
      return magicUrl;
    })
    .not.toBeNull();

  await page.goto(magicUrl!);
  await expect(page).toHaveURL(/\/$/, FIRST_ROUTE_LOAD);
}

test("phase 3 AI journey with a simulated provider: suggest -> source -> studio -> ask -> session", async ({
  page,
  request,
}) => {
  test.setTimeout(120_000);
  await routeApiToAiInstance(page);
  await signIn(page, request, `ai-journey-${Date.now()}@margem.local`);

  await page.getByLabel("Nome do caderno").fill("Sistemas Distribuídos");
  await page.getByRole("button", { name: "Criar caderno" }).click();
  await page.getByRole("button", { name: "Escrever a primeira nota" }).click();
  await page.getByLabel("Título da nota").fill("Consenso Raft");
  const saved = page.waitForResponse(
    (res) =>
      res.request().method() === "PATCH" &&
      /\/notes\/[^/]+$/.test(new URL(res.url()).pathname) &&
      (res.request().postData() ?? "").includes(NOTE_TEXT),
  );
  await page.locator(".ProseMirror").click();
  await page.keyboard.type(NOTE_TEXT);
  await saved;
  await expect(page).toHaveTitle("Consenso Raft — Margem");

  await page.getByRole("button", { name: "Sugerir lacunas e perguntas" }).click();
  await page
    .getByRole("button", { name: "Aprovar pergunta: Quem o Raft elege a cada mandato?" })
    .click();
  await expect(page.getByText("Pergunta aprovada")).toBeVisible();

  await page.getByRole("button", { name: "Colar material" }).click();
  await page.getByLabel("Título do material").fill("Aula 04 — Raft");
  await page.getByLabel("Texto do material").fill(SOURCE_TEXT);
  await page.getByRole("button", { name: "Anexar material à nota" }).click();
  await expect(page.getByRole("button", { name: "Abrir o material" })).toBeVisible();

  await page.getByRole("link", { name: "Estúdio do caderno" }).click();
  await expect(page.getByRole("heading", { name: "Material do caderno" })).toBeVisible(
    FIRST_ROUTE_LOAD,
  );
  await page
    .getByRole("article", { name: "Aula 04 — Raft" })
    .getByRole("button", { name: "Abrir material" })
    .click();

  await page.getByRole("button", { name: "Gerar quiz com IA" }).click();
  await page
    .getByRole("button", {
      name: "Aprovar prática: Quem replica o log para os seguidores no Raft?",
    })
    .click();
  await expect(page.getByText("Prática aprovada. Ela entra na revisão do dia.")).toBeVisible();

  await page.getByLabel("Pergunte ao caderno").fill("Quem replica o log no Raft?");
  await page.getByRole("button", { name: "Perguntar" }).click();
  const answer = page.getByRole("region", { name: "Resposta do caderno" });
  await expect(answer).toContainText("O líder replica o log para os seguidores.");
  await expect(answer).toContainText("De onde veio");

  await page.getByRole("tab", { name: /Visão geral/ }).click();
  await page
    .getByRole("article", { name: "Aula 04 — Raft" })
    .getByRole("button", { name: "Praticar" })
    .click();
  await expect(page.getByText("1 de 1")).toBeVisible();
  await page.getByPlaceholder("Escreva antes de olhar o trecho").fill("O líder");
  await page.getByRole("button", { name: "Ver o trecho e conferir" }).click();
  await page.getByRole("button", { name: "Fácil" }).click();
  await expect(page.getByRole("heading", { name: "Sessão concluída" })).toBeVisible();

  await page.unrouteAll({ behavior: "ignoreErrors" });
  expect(fakeAi.features).toEqual(
    expect.arrayContaining(["clozes+questions", "items", "answer+citations"]),
  );
});
