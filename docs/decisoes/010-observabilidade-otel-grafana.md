# ADR-010: Observabilidade com OpenTelemetry e stack Grafana auto-hospedada

- **Status:** Aceita
- **Data:** 2026-11-23

## Contexto

O Margem tem api, worker, filas, IA externa, busca e tempo real numa VPS só. Sem observabilidade, um job travado ou um provedor de IA fora do ar só aparece quando alguém reclama. A Mari também quer aprender observabilidade com o projeto, e o custo precisa ser zero.

## Decisão

Instrumentar tudo com OpenTelemetry e mandar pro OTel Collector, que exporta métricas pro Prometheus, logs pro Loki e traces pro Tempo, com Grafana pra painéis e alertas. Erros no GlitchTip. Monitor externo gratuito pra disponibilidade. O contexto do trace atravessa as filas.

## Alternativas consideradas

- SigNoz (tudo em um): mais simples de operar; fica como plano B se a stack Grafana pesar na VPS.
- Grafana Cloud no plano gratuito: tira peso da VPS; possível trocando só o destino no Collector.
- Ferramentas pagas (Datadog, New Relic): descartadas pelo custo.
- Só logs: descartado; não mostra latência nem o caminho entre api e worker.

## Consequências

Mais containers e de 1,5 a 2 GB de memória reservados, com retenção curta. Nenhum código depende de fornecedor. Instrumentação mínima entra na definição de pronto.
