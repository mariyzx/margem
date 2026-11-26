# Observabilidade

Como saber o que está acontecendo no Margem em produção, por que algo ficou lento e quando algo quebrou, antes de um amigo reclamar. Também é um objetivo de aprendizado do projeto, então a seção final é uma trilha em etapas.

## Stack

Padrão aberto e auto-hospedado, sem custo:

| Peça | Papel |
| --- | --- |
| **OpenTelemetry (OTel)** | Padrão de instrumentação. SDK no Node (api, worker, collab) e no navegador. Nada do código depende de um fornecedor. |
| **OTel Collector** | Recebe tudo dos apps, remove dado sensível, faz amostragem e manda pra cada destino. |
| **Prometheus** | Métricas (números ao longo do tempo). |
| **Loki** | Logs. |
| **Tempo** | Traces (o caminho de uma requisição entre serviços). |
| **Grafana** | Painéis, exploração e alertas. Liga log ↔ trace ↔ métrica pelo `trace_id`. |
| **GlitchTip** (compatível com Sentry) | Erros com stack trace, no back e no front. Alternativa: plano gratuito do Sentry. |
| **node_exporter + cAdvisor** | Métricas da VPS e dos containers. |
| **Monitor externo de disponibilidade** | Um serviço gratuito fora da VPS (ex.: UptimeRobot ou Better Stack) pingando `/health`. Se a VPS cair, quem está nela não consegue avisar. |

Tudo roda no Compose numa rede `observability`, sem porta pública. O Grafana fica atrás do Caddy com login, ou só pela Tailscale. Memória: reservar uns 1,5 a 2 GB pra essa stack; definir retenção curta (ex.: 7 dias de logs e traces, 30 de métricas) pra caber no disco.

Alternativa mais simples, se a stack completa pesar: **SigNoz** (tudo em um, nativo de OpenTelemetry) ou o plano gratuito do **Grafana Cloud**. Como a instrumentação é OTel, trocar o destino é só configurar o Collector.

## Os três sinais, aplicados ao Margem

### Logs
- JSON estruturado com **pino**, com `level`, `msg`, `trace_id`, `span_id`, `userId` (hash), `route` e `jobId` quando houver.
- Níveis: `error` (algo quebrou e precisa de ação), `warn` (degradou, mas seguiu, como cair no fallback de IA), `info` (eventos de negócio importantes), `debug` (desligado em produção).
- **Nunca** logar conteúdo de nota, texto de fonte, prompt, resposta da IA, chave, token, e-mail completo ou IP completo.

### Métricas
Método **RED** pra tudo que atende pedidos (Rate, Errors, Duration) e **USE** pra recursos (Utilização, Saturação, Erros).

| Área | Métricas |
| --- | --- |
| API | requisições por rota e status, latência p50/p95/p99 por rota |
| Filas (BullMQ) | jobs esperando, tempo de espera, tempo de processamento, falhas por fila, tamanho da fila `-failed` |
| Ingestão | tempo por etapa (extrair, quebrar, embedding, indexar), fontes `failed` por motivo |
| IA | latência e erros por provedor e por tipo (chave inválida, cota, timeout), tokens por feature, uso de fallback |
| Busca e RAG | latência do Elasticsearch, buscas sem resultado, respostas "não encontrei" |
| Tempo real | conexões WebSocket ativas, documentos Yjs abertos, salas do quiz |
| Infra | CPU, memória, disco, heap do Elasticsearch, conexões do Postgres, memória do Redis |
| Front | Web Vitals (LCP, INP, CLS) por tela, erros de JS |
| Produto (agregado) | revisões feitas por dia, notas criadas, itens vencidos não revisados |

Métricas de produto são sempre agregadas, nunca por pessoa identificável.

### Traces
- Auto-instrumentação do OTel pra HTTP, NestJS, Prisma/pg, ioredis e fetch.
- Spans manuais nos pontos que importam: `ai.complete` (provedor, modelo, feature, tokens, sem conteúdo), `search.hybrid`, `ingest.extract`, `ingest.embed`, `srs.schedule`.
- **Trace atravessando a fila:** a api grava o contexto do trace nos dados do job; o worker continua o mesmo trace. Assim dá pra ver "upload do PDF → fila → extração → embeddings → indexação" numa linha só.
- Do navegador até a api: o front manda o cabeçalho `traceparent`, então um clique lento no celular aparece ligado ao que aconteceu no servidor.
- Amostragem: 100% dos traces com erro ou lentos, uma fração dos normais (no Collector, por cauda).

## SLOs (metas de serviço)

| Jornada | Meta |
| --- | --- |
| Abrir a revisão do dia | 99% das requisições sem erro; p95 abaixo de 1 s |
| Avaliar um card | p95 abaixo de 300 ms |
| Salvar a nota | 99,5% sem erro |
| Processar uma fonte | p95 abaixo de 2 min do upload até `ready` |
| Lembrete da revisão | sai até 15 min depois do horário marcado |

## Alertas

Alertar por **sintoma que a pessoa sente**, não por causa provável. Mandar pro Telegram ou Discord via Grafana Alerting.

- Erros da api acima de 2% por 5 minutos.
- p95 da revisão do dia acima de 1 s por 10 minutos.
- Fila de ingestão com jobs esperando há mais de 10 minutos, ou a fila `-failed` crescendo.
- Disco acima de 80%; heap do Elasticsearch acima de 85%.
- `/health` fora do ar (monitor externo).
- Lembretes atrasados.

Cada alerta tem um link pro painel e uma linha dizendo o que conferir primeiro.

## Painéis

1. **Visão geral:** SLOs, erros, latência e filas.
2. **API:** RED por rota.
3. **Filas e ingestão:** profundidade, tempo e falhas por etapa.
4. **IA:** por provedor e feature, fallbacks.
5. **Infra:** VPS, containers, bancos.
6. **Front:** Web Vitals e erros por tela.

## Health checks

- `/health/live`: o processo está de pé.
- `/health/ready`: Postgres, Redis e Elasticsearch respondem (Terminus do NestJS). Usado pelo Compose e pelo monitor externo.

## Privacidade

O Collector remove atributos sensíveis antes de exportar (processador de atributos e redaction): conteúdo, e-mail, IP completo, cabeçalhos de autorização. Nenhum span leva texto de nota, de fonte ou de prompt. `userId` vai como hash.

## Trilha de aprendizado

Cada etapa é pequena e já deixa o projeto melhor.

1. **Logs estruturados:** pino com contexto por requisição; ver no terminal e depois no Loki.
2. **Health checks e monitor externo:** saber quando caiu.
3. **Métricas RED da api:** Prometheus + um painel no Grafana. Aprender p95 e por que média engana.
4. **Erros:** GlitchTip no back e no front, com release e source maps.
5. **Traces:** OTel na api, ver um trace de ponta a ponta no Tempo, ligar log ↔ trace pelo `trace_id`.
6. **Trace atravessando a fila:** propagar o contexto da api pro worker. É o ponto que mais ensina sobre sistemas distribuídos.
7. **Métricas de negócio e de fila:** profundidade, espera, falhas por etapa.
8. **SLOs e alertas:** escolher metas, alertar por sintoma, escrever o "o que conferir primeiro".
9. **Front:** Web Vitals e `traceparent` do navegador até a api.
10. **Exercício de incidente:** derrubar o Elasticsearch de propósito e ver se os alertas, os painéis e a degradação pra busca no Postgres funcionam como o planejado.

## Sinais de abuso (já implementados)

Runbook com comandos e consultas: [`infra/docs/investigar-abuso.md`](../infra/docs/investigar-abuso.md).

- **Identificação do cliente:** `ipHash` = HMAC-SHA256 do IP (IPv6 reduzido ao /64) com `LOG_HASH_SECRET`, 16 hex; `userAgent` até 200 caracteres. IP puro não vai para log, AuditLog nem Sentry. O access log do Caddy mascara o IP (/24 e /64) e tira `token`, `code`, `state`, `Cookie`, `Authorization` e `Set-Cookie`.
- **Eventos (`warn`):** `security.rate_limited` (com o nome do throttler), `security.csrf_blocked` (com o motivo) e `security.quota_exceeded` (com o recurso). Cada um é logado no máximo uma vez a cada 5 min por `ipHash` + rota; todos são somados no hash `security:daily:<dia UTC>` do Redis.
- **AuditLog:** toda escrita leva `ipHash` e `userAgent`. Eventos de auth: `auth.magic_link_requested` (`emailHash`, `outcome`: `sent` | `email_limited` | `global_cap`), `auth.magic_link_verify_failed` (`reason`: `invalid` | `expired` | `used`), `auth.google_failed` (`reason`: `state_mismatch` | `email_not_verified` | `token_invalid`). Uma falha ao gravar vira `audit.write_failed` e não interrompe o fluxo.
- **Resumo diário:** o job das 03:30 (America/Sao_Paulo) loga `security.daily_summary` com os contadores do dia UTC anterior e apaga o hash. No mesmo job, AuditLog mais antigo que `AUDIT_RETENTION_DAYS` (padrão 90) é apagado em lotes de 1.000.
- **`x-request-id`:** só é aceito do cliente se casar com `^[A-Za-z0-9-]{8,64}$`; senão a API gera um UUID.
