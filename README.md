# Margem

**Um caderno que te faz lembrar, não só reler.**

[English](README.en.md) · [Abrir o app](https://margem.mwv.dev.br/)

Margem é um app de estudo ativo. Você escreve a nota com as próprias palavras, marca o que quer lembrar e o app te testa no dia certo com revisão espaçada. Funciona no navegador e como PWA no celular: escreve no computador depois da aula, revisa no ônibus.

<!-- Prints: coloque em docs/assets/ e descomente
<p align="center">
  <img src="docs/assets/editor.png" alt="Editor com trechos marcados como lacuna e perguntas na margem" width="70%">
  <img src="docs/assets/revisao-celular.png" alt="Revisão do dia no celular" width="25%">
</p>
-->

## Por que existe

Assistir aula e reler anotação dá a sensação de que você aprendeu, mas o conteúdo não fixa. O que fixa é tentar lembrar (_retrieval practice_) e voltar ao assunto no intervalo certo (_spacing_). Ferramentas como o Notion organizam bem e não fazem ninguém lembrar de nada.

O Margem foi feito em cima dessas duas ideias. A pesquisa que embasa as decisões está em [`docs/01-pesquisa-aprendizagem.md`](docs/01-pesquisa-aprendizagem.md).

## Como funciona

- **Cadernos por matéria** com um editor de blocos (TipTap).
- **Lacunas:** o marca-texto amarelo marca o trecho que vai sumir no modo Estudar.
- **Perguntas na margem**, presas ao trecho de onde saíram.
- **Nota de memória primeiro:** você escreve o que lembra, depois abre o material e completa. Cada bloco guarda de onde veio.
- **Revisão do dia** com FSRS (`ts-fsrs`). O app decide quando cada lacuna e pergunta volta.
- Login por link mágico ou Google, tema claro e escuro, foco visível e suporte a "reduzir movimento".

### O que vem depois

| Fase                                                                       | Status    |
| -------------------------------------------------------------------------- | --------- |
| 0. Base: monorepo, CI/CD, deploy, segurança, backup                        | ✅ pronta |
| 1. Núcleo sem IA: cadernos, editor, lacunas, perguntas, revisão            | ✅ pronta |
| 2. Fontes e busca: PDF, links, busca híbrida com Elasticsearch             | 🔜        |
| 3. IA do usuário: confere a nota, sugere perguntas, explica depois do erro | 🔜        |
| 4. Turma: tema da semana, edição colaborativa, quiz ao vivo                | 🔜        |

Roadmap completo em [`docs/09-roadmap.md`](docs/09-roadmap.md).

## Princípios

1. **A IA nunca escreve a nota por você.** Ela confere, pergunta e explica depois do erro ([ADR-001](docs/decisoes/001-ia-confere-nao-escreve.md)).
2. **Tudo funciona sem IA.** Quando a IA entrar, cada pessoa usa a própria conta e a chave fica criptografada no servidor, nunca no navegador ([ADR-002](docs/decisoes/002-ia-do-usuario-custo-zero.md)).
3. **Custo zero de infraestrutura.** Roda numa VPS ARM gratuita da Oracle, com serviços auto-hospedados.

## Stack

TypeScript de ponta a ponta, num monorepo pnpm + Turborepo.

| Parte                            | Tecnologias                                                         |
| -------------------------------- | ------------------------------------------------------------------- |
| `apps/web`                       | Next.js, Tailwind v4, Radix/shadcn, TipTap, Motion, PWA             |
| `apps/api`                       | NestJS, Prisma, PostgreSQL, Redis                                   |
| `packages/srs`                   | Wrapper do `ts-fsrs`, sem dependência de framework                  |
| `packages/shared`                | Schemas Zod usados pela web e pela API                              |
| `packages/ui`, `packages/config` | Componentes e tokens do design system                               |
| Infra                            | Docker Compose, Caddy, GitHub Actions, VPS ARM (Oracle Always Free) |
| Qualidade                        | Vitest, Playwright, ESLint, Semgrep, GlitchTip                      |

## Decisões de arquitetura

Cada escolha que não é óbvia tem um ADR com contexto, alternativas e consequências, em [`docs/decisoes/`](docs/decisoes/). Alguns exemplos:

- [Por que FSRS e não SM-2](docs/decisoes/004-fsrs.md)
- [Web pra escrever, celular pra revisar](docs/decisoes/008-web-escreve-celular-revisa.md)
- [Fila com BullMQ atrás de uma interface](docs/decisoes/009-fila-bullmq.md)
- [Observabilidade com OpenTelemetry e Grafana auto-hospedado](docs/decisoes/010-observabilidade-otel-grafana.md)

A documentação completa (produto, telas, modelo de dados, segurança, observabilidade) está em [`docs/`](docs/).

## Rodando localmente

Pré-requisitos: Node 22+, pnpm e Docker.

```bash
git clone https://github.com/mariyzx/margem.git
cd margem
cp .env.example .env

docker compose -f infra/docker-compose.yml up -d   # postgres, redis e mailpit
pnpm install

set -a && source .env && set +a                     # o Prisma não lê o .env da raiz sozinho
pnpm db:migrate

pnpm dev
```

- Web: http://localhost:3000
- API: http://localhost:3001
- E-mails do link mágico (Mailpit): http://localhost:8025

### Outros comandos

```bash
pnpm test          # testes unitários (Vitest) em todos os pacotes
pnpm test:e2e      # testes end-to-end (Playwright)
pnpm lint && pnpm typecheck
```

## Segurança

Todo endpoint confere se o dado pertence ao usuário (ou à turma dele) e existe teste de acesso indevido pra cada um. Os serviços internos não têm porta pública, os segredos ficam fora do repositório (o CI roda gitleaks e Semgrep) e o backup do banco é criptografado. Detalhes em [`docs/10-seguranca.md`](docs/10-seguranca.md).

## Autora

Feito por [Mariana Werneck](https://github.com/mariyzx), pra estudar e pros amigos estudarem junto.

## Licença

[MIT](LICENSE)
