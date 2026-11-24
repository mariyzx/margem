# ADR-006: Estúdio com três modos na mesma tela

- **Status:** Aceita
- **Data:** 2026-11-23

## Contexto

O layout em três colunas (fontes, chat, geradores) ficou igual ao NotebookLM. Foram desenhadas três alternativas: fichário, folha com margem e sessão guiada. A Mari gostou das três.

## Decisão

O Estúdio tem três modos numa tela só, com navegação fixa e transição: Visão geral (fichário), Ler e praticar (folha com margem) e Sessão guiada. Prática em destaque; consulta (resumo, slides, áudio) secundária.

## Alternativas consideradas

Escolher só um dos três (descartado: cada um serve a um momento). Três telas separadas (descartado: recarregava e piscava).

## Consequências

Estado de cada modo preservado ao alternar. Links entre modos trocam o modo, não a página.
