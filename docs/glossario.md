# Glossário

Use estes termos na interface (pt-BR) e os nomes em inglês no código.

| Termo (interface) | Código | O que é |
| --- | --- | --- |
| Caderno | `Notebook` | Agrupa notas e fontes de uma matéria ou curso. Tem nome e cor. |
| Nota | `Note` | Texto escrito pela pessoa sobre um tema, em blocos (editor). Pertence a um caderno. |
| Bloco | `Block` | Parágrafo, título, lista, código, dúvida etc. dentro da nota (documento TipTap). |
| Trecho | `Anchor` | Intervalo de texto dentro de uma nota (ou de uma fonte) ao qual algo está preso. |
| Lacuna | `Cloze` | Trecho marcado com marca-texto que some no modo Estudar e vira item de revisão. |
| Pergunta | `Question` | Pergunta presa a um trecho, mostrada na margem. Autor: a pessoa, alguém da turma ou a IA. |
| Margem | `Margin` | Coluna ao lado da nota (ou da fonte) onde ficam perguntas, respostas e práticas. |
| Dúvida | `DoubtBlock` | Bloco da nota pra anotar algo a perguntar depois. |
| Escrito de memória | `origin: memory` | Parte da nota escrita antes de abrir o material. |
| Completado com o material | `origin: material` | Parte da nota escrita depois de abrir o material. |
| Fonte / material | `Source` | PDF, slides, link (vídeo ou página) ou texto colado, ligado a um caderno. |
| Trecho da fonte | `SourceChunk` | Pedaço indexado de uma fonte, com página ou tempo, usado na busca e nas citações. |
| Estúdio | `Studio` | Área pra praticar a partir das fontes. Tem três modos: visão geral, ler e praticar, sessão guiada. |
| Prática | `PracticeItem` | Item gerado no Estúdio: quiz, flashcard, lacuna na fonte, "por quê?". |
| Card / item de revisão | `ReviewItem` | Qualquer coisa que entra na revisão espaçada: lacuna, pergunta, flashcard, prática. |
| Revisão do dia | `DailyReview` | Fila de itens vencidos hoje, misturando temas. |
| Avaliação | `Rating` | Errei / Difícil / Fácil (mapeia pra `Again` / `Hard` / `Easy` do FSRS; `Good` reservado). |
| Modo Escrever / Estudar | `mode: write | study` | Alternância da nota: Estudar esconde lacunas e testa as perguntas. |
| Despeja tudo | `free recall` | Escrever de memória antes de olhar o material. No fluxo atual, é o começo da própria nota. |
| Turma | `Group` | Grupo de pessoas estudando um caderno juntas. |
| Tema da semana | `GroupTopic` | Tema da turma; cada um publica sua nota antes de ver as dos outros. |
| Perguntas cruzadas | `cross questions` | Perguntas de outras pessoas da turma que entram na sua revisão. |
| Quiz ao vivo | `LiveQuiz` | Sessão em tempo real da turma com as perguntas do grupo. |
| Mapa de memória | `MemoryMap` | Canvas de notas ligadas, com blocos e ligações escondidos pra completar. |
| Assistente de IA | `AiSettings` | Configuração de IA da pessoa: liga ou desliga a IA e, se quiser, conecta OpenRouter ou Groq. |
| Modelo local | `local` | Modelo de texto pequeno no Ollama, desligado por padrão (`OLLAMA_CHAT_ENABLED`); ligar só pra testar sem chave. Em produção não há Ollama (ADR-013). |
| Botão de prompt pronto | `prompt handoff` | Reserva quando a IA está desligada ou falha: abre Claude, ChatGPT ou Gemini com o pedido montado; o resultado não volta pro app. |
