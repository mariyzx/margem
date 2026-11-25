# Margem

**A notebook that makes you remember, not just reread.**

[Português](README.md) · [Open the app](https://margem.mwv.dev.br/)

Margem is an active-learning study app. You write notes in your own words, mark what you want to remember, and the app quizzes you on the right day using spaced repetition. It runs in the browser and as a PWA on your phone: write on the laptop after class, review on the bus.

> The app interface and the project docs are in Brazilian Portuguese.

<!-- Screenshots: add them to docs/assets/ and uncomment
<p align="center">
  <img src="docs/assets/editor.png" alt="Editor with highlighted cloze gaps and questions in the margin" width="70%">
  <img src="docs/assets/revisao-celular.png" alt="Daily review on a phone" width="25%">
</p>
-->

## Why

Watching lectures and rereading notes feels like learning, but it doesn't stick. What sticks is trying to recall (_retrieval practice_) and coming back at the right interval (_spacing_). Tools like Notion are great at organizing and do nothing to make you remember.

Margem is built around those two ideas. The research behind the product decisions is in [`docs/01-pesquisa-aprendizagem.md`](docs/01-pesquisa-aprendizagem.md).

## How it works

- **Notebooks per subject** with a block editor (TipTap).
- **Cloze gaps:** the yellow highlighter marks text that disappears in Study mode.
- **Questions in the margin**, anchored to the passage they came from.
- **Memory first:** you write what you remember, then open the source material and fill in the rest. Each block records where it came from.
- **Daily review** scheduled with FSRS (`ts-fsrs`). The app decides when each gap and question comes back.
- Magic-link or Google sign-in, light and dark themes, visible focus and reduced-motion support.

### Roadmap

| Phase                                                                               | Status  |
| ----------------------------------------------------------------------------------- | ------- |
| 0. Foundation: monorepo, CI/CD, deploy, security, backups                           | ✅ done |
| 1. Core without AI: notebooks, editor, gaps, questions, review                      | ✅ done |
| 2. Sources and search: PDFs, links, hybrid search with Elasticsearch                | 🔜      |
| 3. Bring-your-own AI: checks your note, suggests questions, explains after mistakes | 🔜      |
| 4. Study groups: weekly topic, collaborative editing, live quiz                     | 🔜      |

## Principles

1. **AI never writes the note for you.** It checks, asks and explains after you get something wrong ([ADR-001](docs/decisoes/001-ia-confere-nao-escreve.md)).
2. **Everything works without AI.** When AI arrives, each person uses their own account, and the key stays encrypted on the server, never in the browser ([ADR-002](docs/decisoes/002-ia-do-usuario-custo-zero.md)).
3. **Zero infrastructure cost.** Runs on a free Oracle ARM VPS with self-hosted services.

## Stack

TypeScript end to end, in a pnpm + Turborepo monorepo.

| Part                             | Technologies                                                        |
| -------------------------------- | ------------------------------------------------------------------- |
| `apps/web`                       | Next.js, Tailwind v4, Radix/shadcn, TipTap, Motion, PWA             |
| `apps/api`                       | NestJS, Prisma, PostgreSQL, Redis                                   |
| `packages/srs`                   | Framework-free wrapper around `ts-fsrs`                             |
| `packages/shared`                | Zod schemas shared by web and API                                   |
| `packages/ui`, `packages/config` | Design system components and tokens                                 |
| Infra                            | Docker Compose, Caddy, GitHub Actions, ARM VPS (Oracle Always Free) |
| Quality                          | Vitest, Playwright, ESLint, Semgrep, GlitchTip                      |

## Architecture decisions

Every non-obvious choice has an ADR with context, alternatives and consequences in [`docs/decisoes/`](docs/decisoes/) (in Portuguese). For example: why FSRS instead of SM-2, why the web is for writing and the phone is for reviewing, and why the job queue sits behind an interface.

## Running locally

Requirements: Node 22+, pnpm and Docker.

```bash
git clone https://github.com/mariyzx/margem.git
cd margem
cp .env.example .env

docker compose -f infra/docker-compose.yml up -d   # postgres, redis and mailpit
pnpm install

set -a && source .env && set +a                     # Prisma doesn't read the root .env on its own
pnpm db:migrate

pnpm dev
```

- Web: http://localhost:3000
- API: http://localhost:3001
- Magic-link emails (Mailpit): http://localhost:8025

```bash
pnpm test          # unit tests (Vitest) across all packages
pnpm test:e2e      # end-to-end tests (Playwright)
pnpm lint && pnpm typecheck
```

## Security

Every endpoint checks that the data belongs to the user (or their study group), and each one has a test for unauthorized access. Internal services have no public ports, secrets stay out of the repo (CI runs gitleaks and Semgrep), and database backups are encrypted. Details in [`docs/10-seguranca.md`](docs/10-seguranca.md).

## Author

Built by [Mariana Werneck](https://github.com/mariyzx) to study with, and for her friends to study together.

## License

[MIT](LICENSE)
