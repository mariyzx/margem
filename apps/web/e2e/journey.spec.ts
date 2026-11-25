import { expect, test } from "@playwright/test";

const MAILPIT_URL = process.env.MAILPIT_URL ?? "http://localhost:8025";

test("phase 1 study journey: sign-in -> notebook -> note -> study -> review", async ({
  page,
  request,
}) => {
  const email = `journey-${Date.now()}@margem.local`;

  await page.goto("/");
  await expect(page).toHaveURL(/\/entrar$/);

  await page.getByLabel("E-mail").fill(email);
  await page.getByRole("button", { name: "Enviar link de entrada" }).click();
  await expect(page.getByText("Link enviado", { exact: true })).toBeVisible();

  let magicUrl: string | null = null;
  await expect
    .poll(async () => {
      const listRes = await request.get(`${MAILPIT_URL}/api/v1/messages`);
      const listJson = (await listRes.json()) as {
        messages: Array<{ ID: string; To: Array<{ Address: string }> }>;
      };
      const match = listJson.messages.find((m) =>
        m.To.some((recipient) => recipient.Address.toLowerCase() === email.toLowerCase()),
      );
      if (!match) return null;

      const msgRes = await request.get(`${MAILPIT_URL}/api/v1/message/${match.ID}`);
      const msgJson = (await msgRes.json()) as { Text: string };
      const urlMatch = msgJson.Text.match(/https?:\/\/[^\s]+\/entrar\/verificar\?token=[^\s]+/);
      magicUrl = urlMatch ? urlMatch[0] : null;
      return magicUrl;
    })
    .not.toBeNull();

  await page.goto(magicUrl!);
  await expect(page).toHaveURL(/\/$/);

  await page.getByLabel("Nome do caderno").fill("Sistemas Distribuídos");
  await page.getByRole("button", { name: "Criar caderno" }).click();
  await page.getByRole("button", { name: "Escrever a primeira nota" }).click();

  await page.getByLabel("Título da nota").fill("Consenso Raft");
  const editor = page.locator(".ProseMirror");
  await editor.click();
  await page.keyboard.type("Raft elege um líder por mandato.");

  // Select "líder" and create a question
  await page.keyboard.press("Home");
  await editor.selectText();
  await page.getByRole("button", { name: "Virar pergunta" }).click();

  await page.getByLabel("Pergunta").fill("Quem coordena as entradas no Raft?");
  await page.getByLabel("Resposta").fill("O líder eleito para o mandato.");
  await page.getByRole("button", { name: "Salvar pergunta" }).click();
  await expect(page.getByText("Quem coordena as entradas no Raft?")).toBeVisible();

  // Switch to Study mode, miss the question, and send errors to review
  await page.getByRole("button", { name: "Estudar", exact: true }).click();
  await page.getByRole("button", { name: "Mostrar resposta" }).click();
  await page.getByRole("button", { name: "Errei" }).click();
  await page.getByRole("button", { name: "Mandar erros pra revisão" }).click();
  await expect(page.getByText("Erros enviados para a revisão")).toBeVisible();

  // Review in /revisar
  await page.getByRole("link", { name: "Revisão do dia" }).click();
  await expect(page).toHaveURL(/\/revisar$/);
  await expect(page.getByText("Quem coordena as entradas no Raft?")).toBeVisible();
  await page.getByRole("button", { name: "Mostrar resposta" }).click();
  await page.getByRole("button", { name: /Fácil/ }).click();
  await expect(page.getByText("Tudo em dia por hoje")).toBeVisible();
});
