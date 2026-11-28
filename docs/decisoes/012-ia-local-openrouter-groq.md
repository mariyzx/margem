# ADR-012: IA local por padrão, OpenRouter e Groq opcionais

- **Status:** Substituída em parte por [ADR-013](013-ia-so-com-conta-da-pessoa.md) (camada "IA do Margem" e ordem de uso)
- **Data:** 2026-11-26
- **Substitui:** [ADR-002](002-ia-do-usuario-custo-zero.md)

## Contexto

A ADR-002 exigia que cada pessoa conectasse a própria conta pra ter IA dentro do app. Na prática, a maioria dos estudantes não tem chave de API, e as assinaturas que eles têm (Gemini, ChatGPT, Claude) não podem ser usadas por apps de terceiros: Google e Anthropic baniram esse uso em 2026. Os planos grátis também encolheram: o Gemini grátis caiu pra cerca de 20 pedidos por dia no Flash, e o OpenRouter libera 50 pedidos por dia nos modelos `:free` pra quem nunca comprou crédito.

O Ollama já roda na VPS pros embeddings (ADR-005).

## Decisão

Três camadas, todas com custo zero pra dona do projeto:

1. **IA do Margem (padrão).** Um modelo pequeno (3–4B, quantizado) no Ollama da própria VPS. Funciona pra todo mundo, sem configurar nada. O texto não sai do servidor.
2. **Acelerar com a própria conta (opcional).**
   - **OpenRouter:** login OAuth PKCE de um clique, modelos gratuitos (~50 pedidos/dia, ~1.000 com US$ 10 de crédito comprado uma vez).
   - **Groq:** chave colada, criada em um minuto e sem cartão (~1.000 pedidos/dia por modelo).
3. **Botão de prompt pronto (reserva).** Não é mais um modo escolhido: aparece no lugar do recurso quando a IA não responde.

Ordem de uso: provedor conectado pela pessoa → IA do Margem → botão de prompt pronto.

Os números de limite são de nov/2026 e mudam com frequência; confira na página de cada provedor.

## Alternativas consideradas

- **Google AI Studio com chave colada** (removido): o plano grátis ficou pequeno demais pra valer a fricção de colar a chave.
- **Usar a assinatura do estudante (Gemini, ChatGPT, Claude) via OAuth dos CLIs** (descartado): viola os termos dos provedores e o banimento cai na conta do estudante.
- **Margem como conector MCP** pra pessoa usar a assinatura dentro do Claude/ChatGPT/Gemini (descartado por ora: a experiência sai do app).
- **"Sign in with ChatGPT" com uso do plano** (descartado por ora: preview limitado, exige inscrição).
- **Puter.js** (descartado: a chamada sai do navegador e tira a IA do `AiService`).
- **Cloudflare Workers AI** como reserva compartilhada (descartado por ora: a IA local cumpre o papel sem depender de terceiros).
- **IA embutida no Chrome** (adiada: só desktop, sem Android).

## Consequências

- Volta a existir uma IA "do sistema", mas local: a regra "ninguém usa uma chave do sistema" vira "nenhum custo pra dona do projeto".
- Ollama, OpenRouter e Groq falam a API compatível com OpenAI: um adapter só, mudando URL base e credencial.
- A VPS divide memória entre Elasticsearch, Postgres, embeddings e o modelo de texto. As chamadas locais passam pela fila (BullMQ, concorrência 1) e o front mostra o progresso.
- Modelos pequenos erram mais o JSON: validar com Zod, tentar de novo uma vez e cair no botão de prompt pronto.
- Com 50 pedidos/dia no OpenRouter, agrupar chamadas vira requisito (ex.: corrigir as respostas da sessão num pedido só).
- O modelo local precisa ser escolhido medindo velocidade e qualidade em português na VPS ARM antes de fechar.
