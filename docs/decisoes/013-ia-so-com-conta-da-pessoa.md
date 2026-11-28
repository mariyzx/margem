# ADR-013: IA só com a conta da pessoa, Ollama só pra embeddings em produção

- **Status:** Aceita
- **Data:** 2026-11-28
- **Substitui em parte:** [ADR-012](012-ia-local-openrouter-groq.md) (a camada "IA do Margem" e a ordem de uso)

## Contexto

A ADR-012 pôs um modelo de texto pequeno (`qwen2.5:3b`) no Ollama da VPS como IA padrão, pra todo mundo ter IA sem configurar nada. O primeiro deploy mostrou que não cabe:

- A VPS de produção tem 2 CPUs ARM, não 4. O Ollama ficou com 1,5 CPU e dividindo memória com Postgres, Redis e a API.
- "Sugerir lacunas" sem conta conectada passou dos 120 s de limite e caiu no botão de prompt pronto. A pessoa esperou dois minutos pra ver a reserva.
- Mesmo na máquina da Mari (4 CPUs), o modelo de 3B gerava ~9 tokens/s, levava de 60 a 115 s pra carregar e copiava os marcadores do bloco de dados pras citações, o que fazia a checagem de citação descartar quase todas as sugestões (#106).

Enquanto isso, as contas grátis já integradas funcionam bem: Groq (`openai/gpt-oss-120b`, chave colada, sem cartão) e OpenRouter (`google/gemma-4-31b-it:free`, login de um clique).

## Decisão

1. **IA dentro do app só com a conta da pessoa** (Groq ou OpenRouter). Em produção não roda modelo de texto local.
2. **Sem conta conectada, o recurso mostra na hora o convite pra conectar uma conta grátis e o botão de prompt pronto**, sem esperar um modelo lento.
3. **O Ollama continua em produção só pros embeddings** (ADR-005), com CPU e memória menores. O modelo de texto não é baixado no deploy.
4. **O modelo local fica desligado por padrão em todo lugar, inclusive em desenvolvimento** (`OLLAMA_CHAT_ENABLED=false`). Dev se comporta como produção: sem conta, convite e botão de prompt pronto. Dá pra ligar à mão pra testar sem chave, e o e2e liga pra usar o provedor simulado.
5. **IA no navegador (WebGPU) fica no roadmap "Depois"**: um modelo pequeno rodando na máquina da pessoa resolveria o "sem configurar nada" sem pesar na VPS, mas ainda depende de hardware e não roda bem no celular.

Ordem de uso em produção: provedor conectado pela pessoa → botão de prompt pronto.

## Alternativas consideradas

- **Manter a IA local com fila e aviso de lentidão** (descartado): com 1,5 CPU a espera passa de minutos e a qualidade em português não sustenta as citações.
- **VPS maior só pro modelo** (descartado): quebra o custo zero.
- **Gemini (Google AI Studio) como terceira conta grátis** (não agora). Motivos, conferidos em nov/2026:
  - no plano grátis o Google usa o conteúdo enviado pra melhorar os produtos, com leitura humana; nota de estudo pode ter dado pessoal;
  - os termos dizem que a API não é pra uso de consumidores, e cada pessoa colaria a própria chave como consumidora;
  - os limites grátis não estão publicados de forma estável e caíram ao longo de 2026;
  - os modelos grátis trocam com frequência.
  Pode voltar só com plano pago, que não usa o conteúdo pra treino.
- **Cloudflare Workers AI ou outra IA compartilhada** (descartado por ora): volta a ter custo e chave do sistema.

## Consequências

- Sem conta conectada, a pessoa não tem IA dentro do app; o fluxo continua funcionando (regra 1 do `06-ia.md`) e a reserva aparece na hora.
- O convite pra conectar uma conta vira parte do produto: a tela de configurações e os recursos de IA precisam explicar em uma frase como conectar Groq ou OpenRouter.
- Some a necessidade da fila BullMQ pra chamadas locais e da escolha do modelo local na VPS (#106), pelo menos em produção.
- O texto sempre passa por um provedor quando a IA é usada; a tela de configurações já diz isso por provedor.
- A VPS fica com folga pra Elasticsearch e pra stack de observabilidade.
