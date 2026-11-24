# ADR-004: Revisão espaçada com FSRS (ts-fsrs)

- **Status:** Aceita
- **Data:** 2026-11-23

## Contexto

Espaçar é uma das duas técnicas de maior utilidade. Precisamos de um agendador confiável.

## Decisão

Usar `ts-fsrs` (MIT, TypeScript) dentro de `packages/srs`. A interface mostra Errei / Difícil / Fácil, mapeados pra Again / Hard / Easy.

## Alternativas consideradas

SM-2 escrito à mão (descartado: FSRS é o padrão atual, usado nativamente pelo Anki).

## Consequências

Estado FSRS salvo em `ReviewItem` e histórico em `ReviewLog`, o que permite otimizar parâmetros depois.
