# Roadmap

Proposta de ordem. Ainda **não confirmada pela Mari**: ajuste antes de começar a fase 1.

## Fase 0: base
- Monorepo, CI, Docker Compose local, Prisma com o modelo inicial, auth com link mágico.
- `packages/config` com os tokens e `packages/ui` com Button, Field, Toast, Skeleton.
- Deploy na VPS com Caddy, redes do Compose separadas, só 80 e 443 públicos, SSH só por chave.
- Observabilidade base: pino com `trace_id`, `/health/live` e `/health/ready`, monitor externo, GlitchTip.
- Segurança base: cabeçalhos e CSP, limite de taxa, camada de políticas com testes de acesso indevido, gitleaks e auditoria de dependências no CI, backup criptografado.

## Fase 1: núcleo sozinho, sem IA (MVP)
- Cadernos, editor TipTap com blocos, barra de seleção.
- Lacunas e perguntas presas a trechos, margem com trecho citado.
- Modo Estudar.
- Revisão do dia com `ts-fsrs`, web e PWA no celular, lembrete.
- Nova nota: de memória → abrir material → completar, com origem por bloco (fontes de texto colado primeiro).

## Fase 2: fontes e busca
- Upload de PDF (limite, checagem de tipo, bucket privado) e link (worker `fetcher` isolado, com proteção contra SSRF), fila de ingestão com BullMQ e fila de falhas.
- Elasticsearch + embeddings locais, busca híbrida.
- "O que faltou na sua memória" sem IA (similaridade). Tirado em 28/11/2026: o resultado não ajudava (ADR-013).

## Fase 3: IA do usuário
- Configurações do assistente, camada de provedores, chaves criptografadas, defesas contra prompt injection.
- Sugestões de lacunas e perguntas, conferência de nota, correção, explicação depois do erro.
- Estúdio: os três modos, práticas e "pergunte ao caderno".

## Antes de abrir pros amigos
- Página de privacidade, exportar dados e apagar conta, registro de auditoria.
- Observabilidade completa: OTel com traces atravessando a fila, Prometheus, Loki, Tempo, Grafana, SLOs e alertas no Telegram ou Discord.

## Fase 4: turma
- Turmas, convite, tema da semana com "publique antes de ver", perguntas cruzadas.
- Edição colaborativa (Yjs), presença, quiz ao vivo.

## Depois
- IA no navegador (WebGPU): modelo pequeno rodando na máquina da pessoa, pra ter IA sem conectar conta e sem pesar na VPS (ADR-013).
- Mapa de memória (canvas com React Flow).
- Sessão guiada como revisão do dia no celular.
- Resumo, slides, áudio (consulta).
- Tema escuro completo, app nativo (Expo) se o PWA não bastar.
