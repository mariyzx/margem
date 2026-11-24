# Monitoramento externo e erros (Fase 0)

## Rastreamento de erros (GlitchTip / Sentry)

1. Crie um projeto gratuito no GlitchTip Cloud ou Sentry.
2. Copie o DSN para `SENTRY_DSN` (API + Next server) e `NEXT_PUBLIC_SENTRY_DSN` (navegador) no `.env` de produção.
3. Opcional: defina `SENTRY_AUTH_TOKEN` nos secrets do CI para enviar source maps no build.

## Monitor externo de disponibilidade

1. Crie um monitor HTTP gratuito (UptimeRobot ou Better Stack).
2. Aponte para `GET https://<seu-dominio>/api/health/ready` (intervalo de 5 minutos).
3. Configure alerta para e-mail ou Telegram/Discord quando retornar status diferente de `200`.
