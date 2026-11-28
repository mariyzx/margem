# Arquitetura

## Visão geral

```
Navegador (Next.js, PWA)
  ├── HTTP/JSON ──────────▶ api (NestJS)
  ├── WebSocket (Socket.IO) ▶ api: presença, quiz ao vivo, eventos
  └── WebSocket (Yjs) ────▶ collab (Hocuspocus): edição da nota em grupo

api (NestJS)
  ├── PostgreSQL (Prisma)       dados do domínio
  ├── Redis                      filas (BullMQ), cache, pub/sub do Socket.IO
  ├── Elasticsearch              busca híbrida em notas e trechos de fonte
  ├── Object Storage (S3)        arquivos das fontes
  ├── Ollama (local)             embeddings (modelo de texto desligado por padrão)
  └── Provedores de IA do usuário (OpenRouter, Groq), só pela api

worker (mesmo código da api, outro processo)
  └── consome as filas: extrair texto, transcrever, quebrar em trechos, gerar embeddings, indexar, gerar práticas
```

## Monorepo

```
apps/
  web/          Next.js (App Router), Tailwind, Radix/shadcn, TipTap, React Flow, Motion
  api/          NestJS (HTTP + gateways Socket.IO) e entrypoint do worker
  collab/       servidor Hocuspocus (Yjs), autenticado pelo token da api
packages/
  shared/       schemas Zod, tipos, enums do domínio (fonte única de contrato)
  srs/          wrapper de ts-fsrs: agendar, avaliar, converter Rating
  ui/           componentes React do design system (tokens, Button, Lacuna...)
  config/       tsconfig, eslint, tailwind preset com os tokens
infra/
  docker-compose.yml, caddy/Caddyfile, scripts de backup
docs/
```

## Módulos da api (NestJS)

| Módulo | Responsabilidade |
| --- | --- |
| `auth` | link mágico, OAuth Google/GitHub, sessão, convites |
| `notebooks` | cadernos e cores |
| `notes` | notas, blocos (documento TipTap em JSON), origem `memory/material`, âncoras |
| `clozes`, `questions` | lacunas e perguntas presas a trechos |
| `review` | fila do dia, avaliação, agendamento via `packages/srs` |
| `sources` | upload, link, texto colado; dispara a ingestão |
| `ingestion` (worker) | extrair texto (PDF), transcrever (link de vídeo), quebrar em trechos, embeddings, indexar |
| `fetcher` (worker isolado) | buscar conteúdo de links com proteção contra SSRF, numa rede sem acesso aos serviços internos |
| `search` | busca híbrida no Elasticsearch e montagem de contexto pro RAG |
| `studio` | gerar práticas, "pergunte ao caderno", sessão guiada |
| `groups` | turmas, tema da semana, regra "publique antes de ver", perguntas cruzadas |
| `live` | gateway Socket.IO do quiz ao vivo e presença |
| `ai` | camada de provedores, chaves criptografadas, limites, fallback (ver `06-ia.md`) |
| `notifications` | lembrete da revisão (Web Push e e-mail) |

## Fluxos principais

### Nova nota com material
1. `POST /sources` cria a fonte e enfileira `ingest-source`.
2. O worker extrai o texto, quebra em `SourceChunk` (por página ou tempo, de 300 a 800 tokens), gera embeddings no Ollama e indexa no Elasticsearch. Falhou três vezes: o job vai pro conjunto de falhas do BullMQ (que não tem DLQ nativa como o RabbitMQ), a fonte fica com status `failed` e motivo, e um handler move o job pra uma fila `ingest-source-failed` pra investigação.
3. A pessoa escreve de memória. Blocos ganham `origin: memory`.
4. "Abrir o material" registra `materialOpenedAt` na nota; blocos novos a partir daí ganham `origin: material`.
5. "O que faltou": com IA, a api compara o texto `memory` com os pontos principais da fonte e devolve a lista; sem IA, o front oferece o botão de prompt pronto.

### Revisão
1. `GET /review/today` busca `ReviewItem` com `due <= agora`, intercala por tema da mesma matéria e limita a quantidade.
2. `POST /review/:id/rate` com `again | hard | easy` → `packages/srs` calcula o próximo estado → salva `ReviewLog`.

### Pergunte ao caderno (RAG)
1. Busca híbrida (BM25 + vetor) filtrada pelo caderno e pelas fontes marcadas.
2. Monta o contexto com os trechos e as notas da pessoa, cada um com id.
3. Chama o provedor de IA do usuário pedindo resposta só com base no contexto e citando ids.
4. Valida que as citações existem; sem trecho relevante, responde que não encontrou.

## Fila: por que BullMQ

O trabalho em segundo plano é fila de jobs (poucos por dia, um consumidor por tarefa, com retry, atraso e agendamento), não streaming de eventos. BullMQ roda no Redis que já existe, é TypeScript nativo e integra com NestJS. RabbitMQ (broker, roteamento entre serviços) e Kafka (log de eventos, volume alto, replay) ficam pra quando houver vários serviços reagindo ao mesmo evento ou volume que justifique. A fila fica atrás de uma interface `JobQueue` no NestJS pra permitir trocar o transporte sem mexer nos módulos.

## Tempo real

- **Edição colaborativa** (nota do tema da semana e notas compartilhadas): Yjs + Hocuspocus. O documento Yjs é a fonte enquanto está aberto; o servidor salva o JSON no Postgres com debounce.
- **Presença e quiz ao vivo:** Socket.IO nos gateways do NestJS, com adapter Redis.

## Infra (custo zero)

- **VPS:** Oracle Always Free, ARM (até 4 OCPUs e 24 GB no plano; a instância atual tem 2 CPUs), Ubuntu, região São Paulo. Limites de CPU no compose de produção precisam caber nas CPUs da instância, senão o Docker recusa criar o contêiner.
- **Containers:** Docker Compose com `web`, `api`, `worker`, `fetcher`, `collab`, `postgres`, `redis`, `elasticsearch` (single node, heap limitado), `ollama` e `caddy`.
- **Observabilidade:** `otel-collector`, `prometheus`, `loki`, `tempo`, `grafana`, `glitchtip`, `node-exporter` e `cadvisor` numa rede `observability` sem porta pública. Detalhes em `11-observabilidade.md`.
- **Redes:** `internal` (api, worker, collab, bancos e, quando houver, Elasticsearch e Ollama, sem porta publicada), `edge` (Caddy, web, api) e `egress` (só o `fetcher`, com saída pra internet e sem acesso à `internal`). Só o Caddy publica portas (80 e 443). Detalhes em `10-seguranca.md`.
- **Arquivos:** Oracle Object Storage (compatível com S3).
- **HTTPS e proxy:** Caddy.
- **CI/CD:** GitHub Actions (lint, typecheck, testes, build de imagens ARM, deploy por SSH).
- **Backup:** `pg_dump` diário pro Object Storage.
- **Atenção:** a Oracle pode recolher instâncias Always Free ociosas. Conferir a política atual antes de depender do servidor.

## Requisitos não funcionais

- Revisão do dia abre em menos de 1 s no celular em 4G (dados pequenos, cache no service worker).
- Nada de dado de uma turma vaza pra quem não é membro (checagem no back, testes e2e).
- Logs estruturados (pino) sem conteúdo de nota nem chave de IA, com `trace_id`; métricas RED, traces e alertas por SLO (ver `11-observabilidade.md`).
- Funciona sem IA e sem Elasticsearch (busca degrada pra Postgres full-text).
