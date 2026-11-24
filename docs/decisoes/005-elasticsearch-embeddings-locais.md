# ADR-005: Elasticsearch com embeddings locais pra busca e RAG

- **Status:** Aceita
- **Data:** 2026-11-23

## Contexto

A Mari quer aprender RAG e Elasticsearch, e o produto precisa de busca nas notas e nas fontes, com citação.

## Decisão

Elasticsearch single node na VPS, com busca híbrida (BM25 com analisador português + vetor). Embeddings gerados localmente via Ollama num modelo multilíngue. Sem Elasticsearch disponível, a busca degrada pra full-text do Postgres.

## Alternativas consideradas

pgvector no Postgres (mais simples; descartado pelo objetivo de aprendizado e pela busca híbrida madura). Embeddings de API paga (descartado: custo).

## Consequências

Mais um serviço pra operar na VPS; heap do Elasticsearch precisa ser limitado.
