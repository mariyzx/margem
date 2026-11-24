# ADR-007: Canvas com React Flow, não tldraw

- **Status:** Aceita
- **Data:** 2026-11-23

## Contexto

O mapa de memória liga notas e trechos, no estilo do Maestri. O tldraw, desde a versão 4, exige chave de licença em produção, paga pra uso comercial.

## Decisão

Usar React Flow (MIT) para blocos ligados. Desenho livre, se for necessário, com Excalidraw (MIT).

## Alternativas consideradas

tldraw (descartado: licença vira custo se o produto for comercial).

## Consequências

Bloco do canvas referencia `noteId`/`anchorId`; editar no canvas edita a nota.
