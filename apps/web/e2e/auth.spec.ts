import { expect, test } from "@playwright/test";

const MAILPIT_URL = process.env.MAILPIT_URL ?? "http://localhost:8025";

test("magic link sign-in and sign-out flow", async ({ page, request }) => {
  const email = `e2e-${Date.now()}@margem.local`;

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
  await expect(page.getByText(email)).toBeVisible();

  await page.getByRole("button", { name: "Sair", exact: true }).click();
  await expect(page).toHaveURL(/\/entrar$/);
});
