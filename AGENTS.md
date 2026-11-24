# AGENTS.md — Margem

Leia este arquivo inteiro antes de qualquer tarefa. Ele diz o que é o projeto, onde está cada decisão e as regras que valem pra todo código.

## O que é

**Margem** (nome provisório) é um app de estudo ativo, web e PWA no celular. A pessoa escreve notas com as próprias palavras em cadernos por matéria, marca lacunas e perguntas, e o app a testa com revisão espaçada. Dá pra estudar sozinho ou com uma turma de amigos. A IA é opcional, usa a conta de cada usuário e nunca pensa no lugar da pessoa.

Projeto pessoal de portfólio da Mari (dev full-stack pleno). Feito pra ela e os amigos usarem de verdade, com custo zero de infraestrutura e de IA.

## Onde está cada coisa

| Arquivo | Leia quando |
| --- | --- |
| `docs/00-visao-produto.md` | sempre, antes da primeira tarefa |
| `docs/01-pesquisa-aprendizagem.md` | for mexer em qualquer coisa de estudo, revisão ou IA |
| `docs/02-funcionalidades.md` | for implementar ou mudar uma funcionalidade |
| `docs/03-jornada-e-telas.md` | for mexer em fluxo, navegação ou tela |
| `docs/04-arquitetura.md` | for criar módulo, serviço, fila, integração ou mexer em infra |
| `docs/05-modelo-de-dados.md` | for mexer no schema, em migrations ou em queries |
| `docs/06-ia.md` | for mexer em qualquer coisa que chame um modelo de IA |
| `docs/07-design-system.md` | for mexer em UI, estilo, animação ou acessibilidade |
| `docs/08-convencoes.md` | sempre, antes de escrever código ou abrir PR |
| `docs/09-roadmap.md` | for decidir se algo entra agora ou depois |
| `docs/10-seguranca.md` | for mexer em auth, permissão, IA, upload, links, tempo real ou infra |
| `docs/11-observabilidade.md` | for criar endpoint, job, integração externa, ou mexer em logs, métricas e alertas |
| `docs/decisoes/` | antes de propor mudar algo que já foi decidido |
| `docs/glossario.md` | quando um termo do domínio aparecer |

Referências visuais (fonte da verdade do visual, não do código):
- Protótipo clicável: https://claude.ai/artifact/GS6sowqTnYUSbEDanFLokZ
- Design system Margem: https://claude.ai/artifact/GEnbhwddmuG41MvbJrPt9H
- Pesquisa de técnicas de estudo: https://claude.ai/artifact/65v5zmBBuDcPm7C4B18pCJ

## Stack

TypeScript de ponta a ponta. Monorepo pnpm + Turborepo.

- `apps/web`: Next.js (React), Tailwind v4 com tokens do design system, cva + tailwind-merge pras variantes, Radix UI (via shadcn/ui, restilizado) pros componentes acessíveis, Lucide nos ícones, TipTap no editor, React Flow no canvas, Motion pras animações. PWA. Detalhes em `docs/07-design-system.md` e ADR-011.
- `apps/api`: NestJS, Prisma + PostgreSQL, BullMQ + Redis, Socket.IO, Hocuspocus (Yjs).
- `packages/shared`: schemas Zod e tipos usados por web e api.
- `packages/srs`: wrapper do `ts-fsrs` (revisão espaçada), sem dependência de framework.
- Busca e RAG: Elasticsearch (busca híbrida) + embeddings locais via Ollama.
- Infra: Docker Compose numa VPS ARM (Oracle Always Free), Caddy, GitHub Actions.
- Observabilidade: OpenTelemetry → Collector → Prometheus, Loki, Tempo e Grafana; GlitchTip pra erros.

Detalhes e motivos em `docs/04-arquitetura.md`.

## Comandos

> Preencher quando o monorepo existir. Mantenha esta seção atualizada.

```bash
pnpm install
pnpm dev            # web + api
pnpm test           # vitest em todos os pacotes
pnpm test:e2e       # playwright
pnpm lint && pnpm typecheck
pnpm db:migrate     # prisma migrate dev
docker compose up -d postgres redis elasticsearch ollama
```

## Regras que nunca mudam

1. **A IA nunca escreve a nota no lugar da pessoa.** Ela sugere, confere, pergunta e explica depois do erro. Nenhum endpoint gera texto que vai direto pro corpo da nota. Motivo: `docs/01-pesquisa-aprendizagem.md`.
2. **Tudo funciona sem IA.** Editor, lacunas, perguntas escritas pela pessoa, revisão e turma não dependem de provedor de IA.
3. **Chave de IA nunca chega no navegador.** Fica criptografada no banco e as chamadas saem da API. O front só vê os 4 últimos caracteres.
4. **Custo zero pra dona do projeto.** Não adicione serviço pago, nem uma chave de IA "do sistema" que pague o uso de todos.
5. **Prática antes de consulta.** Recursos que fazem a pessoa lembrar (quiz, lacunas, flashcards, "por quê?") ficam em destaque. Resumo, slides e áudio são secundários, e o resumo só libera depois que a pessoa escreveu a própria nota.
6. **Português do Brasil na interface**, com o tom descrito em `docs/07-design-system.md`. Código, nomes de arquivo, commits e identificadores em inglês.
7. **Acessível e com "reduzir movimento".** Foco visível, rótulos, `aria-*` corretos e `prefers-reduced-motion` respeitado.
8. **Todo acesso a dado confere dono ou turma no back.** Nenhum endpoint busca por id sem checar permissão. Teste de acesso indevido é obrigatório.
9. **Entrada externa é hostil.** Links passam pela proteção contra SSRF, arquivos têm limite e checagem de tipo, HTML é sanitizado e texto de PDF ou da turma nunca vira instrução pra IA.
10. **Nada de segredo no código, no log ou no repositório.** Serviços internos (Postgres, Redis, Elasticsearch, Ollama) nunca ganham porta pública.
11. **Não invente requisito.** Se algo não está nos docs, pergunte ou marque como `TODO(decisão)` e siga com a opção mais simples.

## Como trabalhar aqui (pra agentes)

- **Uma issue por tarefa.** Leia a issue, os docs que ela cita e o código que ela toca antes de escrever. Se a issue contradiz um doc, pare e aponte a contradição.
- **Papéis:** líder (quebra o épico em issues), dev (implementa uma issue), revisor (revisa o PR contra os docs e as convenções), QA (testa o fluxo no navegador com Playwright). Cada papel só faz o próprio trabalho.
- **Definição de pronto:** testes passando, lint e typecheck limpos, acessibilidade básica conferida, checklist de segurança do PR (`docs/10-seguranca.md`) respondido, instrumentação mínima (logs estruturados sem dado sensível, span nos pontos novos que chamam algo externo ou demoram), docs atualizados se a mudança alterou comportamento, e PR descrevendo o que mudou e como testar.
- **Mudou auth, permissão, criptografia ou infra?** Marque o PR pra revisão humana. Agente não aprova sozinho esse tipo de mudança.
- **Mudou uma decisão?** Escreva um novo arquivo em `docs/decisoes/` em vez de editar o antigo em silêncio.
- **Branches:** fluxo de épico em `docs/08-convencoes.md`.
