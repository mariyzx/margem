# ADR-002: IA da conta de cada usuário, custo zero

- **Status:** Substituída por [ADR-012](012-ia-local-openrouter-groq.md)
- **Data:** 2026-11-23

## Contexto

A Mari não quer gastar com IA, e os amigos também vão usar. Assinaturas de consumo (Claude, ChatGPT) não podem ser usadas por apps de terceiros.

## Decisão

Cada usuário escolhe: sem IA, botão de prompt pronto (abre Claude, ChatGPT ou Gemini com o pedido montado) ou IA dentro do app com a própria conta (OpenRouter com login, Google AI Studio ou Groq com chave). Configurável por usuário e por recurso.

## Alternativas consideradas

Pagar um modelo barato pra todos (descartado: custo). IA no navegador com WebLLM (adiado: download pesado e fraco no celular). Login com conta do Claude (descartado: não permitido pra apps de terceiros).

## Consequências

Precisa de camada de provedores, chaves criptografadas, fallback pro botão de prompt pronto e um núcleo que funciona sem IA.
