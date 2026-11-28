# Decisões

Cada arquivo registra uma decisão: contexto, o que foi decidido, alternativas e consequências. Não edite uma decisão antiga pra mudá-la: crie uma nova que a substitua e marque a antiga como "Substituída por ADR-NNN".

| ADR | Decisão | Status |
| --- | --- | --- |
| [001](001-ia-confere-nao-escreve.md) | A IA confere e pergunta, não escreve a nota | Aceita |
| [002](002-ia-do-usuario-custo-zero.md) | IA da conta de cada usuário, custo zero | Substituída por 012 |
| [003](003-nota-de-memoria-continua.md) | Nota começa de memória e continua com o material no mesmo editor | Aceita |
| [004](004-fsrs.md) | Revisão espaçada com FSRS (`ts-fsrs`) | Aceita |
| [005](005-elasticsearch-embeddings-locais.md) | Elasticsearch com embeddings locais pra busca e RAG | Aceita |
| [006](006-estudio-tres-modos.md) | Estúdio com três modos na mesma tela | Aceita |
| [007](007-canvas-react-flow.md) | Canvas com React Flow, não tldraw | Aceita |
| [008](008-web-escreve-celular-revisa.md) | Web pra escrever, celular pra revisar | Aceita |
| [009](009-fila-bullmq.md) | Fila de jobs com BullMQ, atrás de uma interface | Aceita |
| [010](010-observabilidade-otel-grafana.md) | Observabilidade com OpenTelemetry e stack Grafana auto-hospedada | Aceita |
| [011](011-estilo-e-motion.md) | Tailwind + Radix/shadcn + Motion como base de interface | Aceita |
| [012](012-ia-local-openrouter-groq.md) | IA local por padrão, OpenRouter e Groq opcionais | Substituída em parte por 013 |
| [013](013-ia-so-com-conta-da-pessoa.md) | IA só com a conta da pessoa, Ollama só pra embeddings em produção | Aceita |
