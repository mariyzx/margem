# Convenções

## Código

- TypeScript `strict` em tudo. Sem `any` sem comentário explicando.
- Contratos entre web e api só via `packages/shared` (schemas Zod). A api valida toda entrada com eles.
- NestJS: um módulo por área do domínio (ver `04-arquitetura.md`); controller fino, regra no service, acesso a dados via Prisma no service ou repositório.
- React: componentes de UI vêm de `packages/ui`; nada de cor ou tamanho solto fora dos tokens.
- Datas em UTC no banco; fuso do usuário só na interface.
- Identificadores, commits e comentários em inglês; textos de interface em pt-BR num arquivo de mensagens.

## Testes

- **Unitário (Vitest):** `packages/srs`, regras de domínio (publicar antes de ver, origem de bloco, âncoras), prompts (snapshot).
- **Integração:** endpoints da api com banco de teste (Testcontainers ou Postgres do Compose).
- **E2E (Playwright):** jornada principal (entrar → caderno → nota → estudar → revisar) e a regra da turma.
  - A jornada de IA (`apps/web/e2e/ai-journey.spec.ts`) usa um provedor simulado: o teste sobe um servidor falso compatível com a API da OpenAI e uma segunda API (porta 3011) com `OLLAMA_URL` apontando pra ele, e o navegador do teste redireciona as chamadas da 3001 pra 3011. Banco, Redis e Mailpit são os reais.
  - Rode contra o **build de produção** (`pnpm --filter @margem/api build`, `node --env-file=../../.env dist/main.js` na `apps/api`, `pnpm --filter @margem/web build` e `npx next start -p 3000` na `apps/web`), com Postgres, Redis e Mailpit de pé; depois `pnpm --filter @margem/web test:e2e`. Contra o `next dev`, a compilação sob demanda estoura as esperas.
  - Não rode `next build` com o `next dev` aberto: os dois usam `apps/web/.next`, e o build quebra o servidor de dev.
  - O pedido de link de entrada tem limite de 5 por hora por IP; cada rodada da suíte usa 3.
- Bug corrigido vem com o teste que falhava antes.
- Todo endpoint com dado de usuário tem teste de acesso indevido (outro usuário recebe 404).

## Estilo e animação

- Use os utilitários dos tokens; cor, fonte, duração ou curva escrita à mão no componente é erro de revisão.
- Variantes e estados via `cva`; classes condicionais via `cn()`.
- Componente interativo (menu, popover, diálogo, switch, tabs) parte de um primitivo Radix em `packages/ui`, não de `div` com `onClick`.
- Hover, foco, pressionado e cor: transição CSS. Saída, layout ou sequência: Motion (`m` + `AnimatePresence`/`layoutId`/variants). Ver a tabela em `07-design-system.md`.
- Toda animação nova funciona com "reduzir movimento" ligado (testar com a emulação do DevTools).

## Logs e instrumentação

- Use o logger do projeto (pino), nunca `console.log` em código de produção.
- Log é JSON com mensagem curta e campos; nada de conteúdo de nota, fonte, prompt, resposta da IA, chave, e-mail ou IP completo.
- Chamada externa nova (provedor de IA, Elasticsearch, Object Storage, busca de link) ganha um span com nome `<área>.<ação>` e atributos sem conteúdo.
- Job novo de fila propaga o contexto do trace e registra métricas de espera, duração e falha.
- Erro tratado que degrada a experiência (fallback) vira log `warn` e conta numa métrica.

## Segurança no CI

- gitleaks (ou secret scanning do GitHub), `pnpm audit`, CodeQL ou Semgrep e Renovate/Dependabot.
- Hook de pre-commit com gitleaks.
- Checklist de segurança de `10-seguranca.md` no modelo de PR.

## Git e fluxo com agentes

Pra evitar o conflito de subtarefa criada a partir de outra subtarefa:

- Cada épico tem uma branch `epic/<slug>` criada da `main`.
- Cada subtarefa (issue) tem uma branch `feat/<issue>-<slug>` criada **da branch do épico**, nunca de outra subtarefa.
- O PR da subtarefa vai pra branch do épico. Depois de cada merge, as outras subtarefas abertas fazem `rebase` na branch do épico.
- Se uma subtarefa depende de outra que ainda não entrou, espere o merge no épico em vez de ramificar da outra.
- O épico vai pra `main` num PR final, com o e2e da jornada passando.
- Commits no padrão Conventional Commits (`feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`).

## Pull requests

Todo PR descreve:
- issue ligada;
- o que mudou e por quê;
- como testar (passos ou o teste que cobre);
- screenshots ou gravação se mudou UI;
- docs atualizados, se mudou comportamento;
- checklist de segurança respondido, e o rótulo `security-review` se mexeu em auth, permissão, criptografia ou infra.

O revisor confere contra `AGENTS.md`, este arquivo e os docs que a issue cita.

## Issues

Modelo:
- **Contexto:** link pro doc e pra prancha do protótipo.
- **O que fazer:** comportamento esperado.
- **Critérios de aceite:** lista marcável (copiar de `02-funcionalidades.md` quando existir).
- **Fora do escopo:** o que não entra nesta issue.
