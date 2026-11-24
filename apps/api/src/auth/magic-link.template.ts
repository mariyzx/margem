function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function renderMagicLinkEmail(magicUrl: string): string {
  const safeUrl = escapeHtml(magicUrl);

  return `<!doctype html>
<html lang="pt-BR">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Seu link de entrada no Margem</title>
  </head>
  <body style="margin:0;padding:0;background-color:#eceef3;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1a1d29;-webkit-font-smoothing:antialiased;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#eceef3;padding:40px 16px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width:480px;background-color:#ffffff;border:1px solid #dce3f5;border-radius:10px;overflow:hidden;">
            <tr>
              <td style="height:4px;background-color:#2747d9;font-size:0;line-height:0;">&nbsp;</td>
            </tr>
            <tr>
              <td style="padding:32px 32px 28px 32px;">
                <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin-bottom:24px;">
                  <tr>
                    <td valign="bottom" style="width:10px;padding-right:2px;">
                      <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                        <tr>
                          <td style="width:9px;height:9px;border-left:2px solid #1a1d29;border-bottom:2px solid #1a1d29;font-size:0;line-height:0;">&nbsp;</td>
                        </tr>
                      </table>
                    </td>
                    <td valign="middle" style="font-family:Georgia,'Times New Roman',serif;font-size:26px;font-weight:700;line-height:1.1;color:#1a1d29;letter-spacing:-0.02em;padding:4px 2px;">
                      Margem
                    </td>
                    <td valign="top" style="width:10px;padding-left:2px;">
                      <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                        <tr>
                          <td style="width:9px;height:9px;border-top:2px solid #1a1d29;border-right:2px solid #1a1d29;font-size:0;line-height:0;">&nbsp;</td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                </table>

                <h1 style="margin:0 0 10px 0;font-size:18px;line-height:1.4;font-weight:600;color:#1a1d29;">
                  Seu link de entrada
                </h1>

                <p style="margin:0 0 24px 0;font-size:15px;line-height:1.6;color:#5b6070;">
                  Clique no botão abaixo para entrar no seu caderno. Este link vale por 15 minutos e funciona uma única vez.
                </p>

                <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin-bottom:24px;">
                  <tr>
                    <td style="border-radius:6px;background-color:#2747d9;">
                      <a href="${safeUrl}" target="_blank" rel="noopener noreferrer" style="display:inline-block;padding:12px 22px;font-size:14px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:6px;">
                        Entrar no Margem
                      </a>
                    </td>
                  </tr>
                </table>

                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color:#f8f9fc;border:1px solid #dce3f5;border-radius:6px;">
                  <tr>
                    <td style="padding:12px 14px;">
                      <p style="margin:0 0 6px 0;font-size:12px;color:#5b6070;">
                        Se o botão não funcionar, copie e cole este endereço no navegador:
                      </p>
                      <p style="margin:0;font-size:12px;line-height:1.5;word-break:break-all;color:#2747d9;">
                        <a href="${safeUrl}" target="_blank" rel="noopener noreferrer" style="color:#2747d9;text-decoration:underline;">
                          ${safeUrl}
                        </a>
                      </p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 32px 24px 32px;border-top:1px solid #dce3f5;font-size:12px;line-height:1.5;color:#5b6070;">
                Se você não pediu este acesso, pode ignorar este e-mail.
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}
