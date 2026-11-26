# Funcionalidades

Cada seção traz o comportamento esperado e critérios de aceite. Fase de cada item em `09-roadmap.md`. Visual de referência no protótipo (link em `AGENTS.md`).

## 1. Conta e entrada

- Entrar sem senha: link mágico por e-mail, Google ou GitHub.
- Convite de turma por link: quem entra pelo convite cai direto na turma depois do login.
- Abertura com a animação do logo, uma vez por sessão, pulada com `prefers-reduced-motion`.

Aceite:
- [ ] Link mágico expira em 15 minutos e só funciona uma vez.
- [ ] Usuário convidado vê "<Pessoa> te convidou pra <Turma>" antes de entrar.

## 2. Cadernos

- Criar caderno com nome e cor (paleta fechada de cores de caderno do design system).
- Primeiro acesso: estado vazio que leva a criar o primeiro caderno e, em seguida, a primeira nota.
- Barra lateral com árvore caderno → notas.

Aceite:
- [ ] Criar caderno sem nome mostra erro no campo e não cria.
- [ ] Depois de criar, o botão principal é "Escrever a primeira nota".

## 3. Nova nota (material → de memória → completar)

Fluxo em dois passos, numa nota só:
1. **Material (opcional):** subir arquivo (PDF, slides, documento), colar link (vídeo: transcrição; página: texto) ou colar texto. Vira uma `Source` do caderno.
2. **Escrever a nota:** o material fica fechado num painel lateral. A pessoa escreve de memória. Quando clica em "Abrir o material", o painel abre e ela **continua na mesma nota**. O editor marca a origem de cada parágrafo: `memory` (barra cinza) antes de abrir, `material` (barra azul) depois.
3. Com IA conectada (ou busca semântica, sem IA), o painel mostra **"O que faltou na sua memória"**: pontos principais da fonte que não aparecem no texto escrito de memória. Cada um tem "Virar pergunta da revisão".

Aceite:
- [ ] Não existe um segundo campo de texto pra completar: é o mesmo editor.
- [ ] A origem fica salva por bloco e sobrevive a edições (editar um parágrafo `memory` não muda a origem dele).
- [ ] O material só aparece depois do clique em "Abrir o material".
- [ ] A IA não insere texto na nota; ela só lista o que faltou.

## 4. Editor da nota

- Editor de blocos (TipTap): título, parágrafo, listas, código com destaque, dúvida, imagem. Menu "/" para inserir blocos.
- **Selecionar um trecho** abre a barra de seleção: "Esconder como lacuna" (ou "Tirar lacuna") e "Virar pergunta".
- **Margem** à direita: perguntas presas aos trechos, na altura do trecho. Cada pergunta mostra o **trecho citado** entre aspas, com a cor do autor; clicar destaca o trecho na nota e a borda do cartão.
- Sugestões da IA aparecem como perguntas "IA, revise" com Aprovar/Descartar. Só entram na revisão depois de aprovadas.
- Alternância **Escrever / Estudar** (ver 5).
- Presença: avatares de quem está vendo a nota.

Aceite:
- [ ] Pergunta continua presa ao trecho certo depois de edições ao redor (âncora relativa, ver `05-modelo-de-dados.md`).
- [ ] Se o trecho da pergunta for apagado, a pergunta fica "sem trecho" e continua visível, em vez de sumir.
- [ ] Lacuna e pergunta criadas aqui aparecem na revisão a partir do dia seguinte.

## 5. Modo Estudar

- Mesma nota; lacunas viram espaços escondidos do tamanho do texto, que se revelam no clique.
- Perguntas da margem pedem "Mostrar resposta" e depois "Acertei" / "Errei".
- Faixa no topo com o progresso (lacunas reveladas, perguntas respondidas) e "Mandar erros pra revisão".
- Sugestões da IA não aprovadas não aparecem.

Aceite:
- [ ] Revelar uma lacuna não desloca o texto (só cor muda).
- [ ] O que foi marcado como "Errei" fica com vencimento próximo no FSRS.

## 6. Revisão do dia

- Fila com os itens vencidos, misturando temas parecidos da mesma matéria.
- Cartão: pergunta → "Mostrar resposta" → Errei / Difícil / Fácil, com o próximo intervalo escrito no botão.
- Link "Ver isso na minha nota" pro trecho de origem.
- No celular, é a tela inicial, com lembrete (notificação PWA ou e-mail).

Aceite:
- [ ] Intervalos vêm do `ts-fsrs`, nunca calculados à mão na UI.
- [ ] Itens da turma (perguntas cruzadas) entram na mesma fila, marcados com o autor.

## 7. Estúdio (a partir das fontes)

Três modos na mesma tela, com navegação fixa e transição entre eles:
1. **Visão geral (fichário):** cada fonte como cartão, com "você domina X%", baralhos de prática e as ações "Praticar" e "Abrir material". Ordenado do mais fraco pro mais forte. Inclui "Estudar o mais fraco, 20 min".
2. **Ler e praticar (folha com margem):** a fonte como uma folha, com abas de fichário pra cada fonte. A prática escolhida aparece na margem, ao lado do parágrafo de onde saiu: quiz (resposta escrita), lacunas na fonte, flashcards, "por quê?". "Pergunte ao caderno" fica no pé da folha, e a resposta cai na margem citando o trecho.
3. **Sessão guiada:** a pessoa escolhe fontes e tempo (10, 20 ou 40 min); o app monta um roteiro misturando lacuna, quiz e "por quê?", uma atividade por vez, com o trecho de origem escondido até conferir.

Consulta (secundário): resumo (bloqueado até a nota da fonte existir), slides, mapa mental (abre no canvas como mapa de memória), áudio.

Aceite:
- [ ] Toda prática gerada vira `ReviewItem` ligado ao `SourceChunk` de origem.
- [ ] Respostas de "Pergunte ao caderno" sempre citam nota ou trecho de fonte; sem fonte encontrada, dizem que não encontraram.
- [ ] Sem IA conectada, os geradores mostram o botão de prompt pronto.

## 8. Turma

- Criar turma ligada a um caderno; convidar por link.
- **Tema da semana:** cada pessoa escreve a própria nota; as das outras ficam escondidas até ela publicar (mínimo de 40 caracteres).
- Status de revisão do dia de cada membro ("revisou" / "ainda não").
- **Perguntas cruzadas:** perguntas que os outros escreveram entram na sua revisão.
- **Quiz ao vivo:** sessão em tempo real com as perguntas do grupo, com lembrete.

Aceite:
- [ ] A API nunca devolve as notas dos outros antes de a pessoa publicar a dela (regra no back, não só na UI).

## 9. Mapa de memória (canvas)

- Canvas com notas e trechos como blocos, ligados por setas com rótulo ("cache usa TTL").
- Bloco no canvas e nota no editor são a mesma entidade: editar um muda o outro.
- Modo teste: o app esconde blocos ou rótulos de ligação pra completar de cabeça; "Redesenhe do zero" compara com o original.
- Ligações podem virar cards ("Como cache se relaciona com TTL?").

Ainda não desenhado no protótipo. Ver roadmap.

## 10. Assistente de IA (configurações)

- Um interruptor **Usar IA** (ligado por padrão): usa a IA do Margem, local, sem configurar nada.
- **Mais rápida com a sua conta (opcional):** OpenRouter com login ou Groq com chave colada. "Testar e salvar" antes de guardar a chave.
- Sem seletor de modelo: o app escolhe o modelo de cada tarefa.
- A tela diz pra onde vai o texto: local não sai do servidor; com OpenRouter ou Groq, passa pelo provedor.
- Liga/desliga por recurso: sugerir lacunas e perguntas, corrigir respostas abertas, explicar quando errar, conversar com o caderno.
- Fallback: se a conta da pessoa falhar ou a cota acabar, usar a IA do Margem; se ela também falhar, oferecer o botão de prompt pronto pra aquela tarefa.
- Recursos pesados (conversar com o caderno) avisam que ficam lentos sem OpenRouter ou Groq.

Aceite:
- [ ] Chave salva criptografada; o front recebe só os 4 últimos caracteres.
- [ ] Remover a chave apaga o segredo, não só esconde.

Detalhes em `06-ia.md`.
