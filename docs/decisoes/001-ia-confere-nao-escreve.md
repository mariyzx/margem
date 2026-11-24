# ADR-001: A IA confere e pergunta, não escreve a nota

- **Status:** Aceita
- **Data:** 2026-11-23

## Contexto

O amigo sugeriu gerar notas e resumos como o NotebookLM. A pesquisa mostra que gerar o conteúdo com as próprias palavras melhora o aprendizado, e que IA sem limites aumenta acertos na prática e piora a prova (Bastani et al., PNAS 2025).

## Decisão

A IA nunca escreve ou reescreve o corpo da nota. Ela sugere lacunas e perguntas (com aprovação), lista o que faltou comparando com a fonte, corrige respostas escritas, explica depois do erro e gera práticas a partir das fontes.

## Alternativas consideradas

Gerar a nota a partir do material (descartado: volta ao estudo passivo). Resumo livre a qualquer hora (descartado: vira releitura; o resumo só libera depois da nota da pessoa).

## Consequências

Nenhum endpoint escreve no `Note.doc` a partir de saída de IA. Toda sugestão passa por aprovação.
