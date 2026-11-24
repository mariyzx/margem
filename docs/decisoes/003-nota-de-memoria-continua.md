# ADR-003: Nota começa de memória e continua com o material no mesmo editor

- **Status:** Aceita
- **Data:** 2026-11-23

## Contexto

A primeira versão tinha "despeja tudo" e depois "escrever a nota" em telas separadas, e depois um campo separado pra completar. A Mari achou que era escrever de memória duas vezes.

## Decisão

Uma nota só. O material fica fechado num painel; a pessoa escreve de memória e, ao abrir o material, continua no mesmo editor. Cada bloco guarda `origin: memory | material`. O painel lista o que faltou na memória, que pode virar pergunta.

## Alternativas consideradas

Despeja tudo separado da nota (descartado: trabalho repetido, as pessoas pulariam).

## Consequências

O editor precisa marcar a origem por bloco e preservá-la em edições. O "o que faltou" funciona com IA ou com similaridade de embeddings.
