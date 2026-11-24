# Design system

Fonte da verdade: https://claude.ai/artifact/GEnbhwddmuG41MvbJrPt9H (tokens, componentes com todos os estados, guia de motion e marca). Este arquivo resume o que um agente precisa pra implementar.

## Ideia

Material de quem estuda: folha branca, caneta azul, marca-texto amarelo e a linha da margem do caderno. A nota é a protagonista; a interface fica quieta em volta.

## Tokens principais (tema claro)

| Token | Valor | Uso |
| --- | --- | --- |
| `ground` | #ECEEF3 | fundo do app |
| `paper` | #FFFFFF | folha, cartões |
| `margin` / `margin-rule` | #F8F9FC / #DCE3F5 | coluna da margem e a linha dela |
| `ink` / `ink-muted` | #1A1D29 / #5B6070 | texto |
| `bic` | #2747D9 | ação principal, foco, suas perguntas |
| `marker` / `marker-soft` | #FFE45C / #FFF6C2 | lacunas e modo Estudar, **só isso** |
| `correct` | #12805C | acerto |
| `turma` | #7B3FB0 | conteúdo de outra pessoa da turma |
| `danger` | #B42318 | erro de sistema ou formulário, **nunca** resposta errada no estudo |

Tema escuro definido no design system. Implementar os tokens como CSS custom properties num preset do Tailwind em `packages/config`.

## Bibliotecas de interface

| Lib | Papel |
| --- | --- |
| **Tailwind v4** | Estilo. Tokens (cores, fontes, `--dur-*`, `--ease-*`) expostos como utilitários: `bg-bic`, `text-ink-muted`, `duration-base`. Nada de cor ou duração solta no código. |
| **cva + tailwind-merge** (`cn()`) | Variantes e estados dos componentes (`variant`, `size`, `loading`, `disabled`). |
| **Radix UI via shadcn/ui** | Primitivos acessíveis: menu do `/`, barra de seleção (popover), diálogo, dropdown, tooltip, switch, toggle group (Escrever/Estudar), tabs. O shadcn copia o código pro repo em `packages/ui`; restilizar com os tokens do Margem, nunca manter o visual padrão dele. |
| **Lucide** | Ícones, traço 1.5, tamanho 16 ou 20. |
| **next/font** | Literata, Instrument Sans e JetBrains Mono, sem requisição externa. |
| **Motion** (`motion/react`) | Toda animação que não for micro-estado (ver abaixo). |

Não adicionar outra lib de animação (GSAP, Lottie, react-spring) nem outra lib de componentes (MUI, Chakra, Mantine) sem um ADR novo.

## Tipografia

- **Literata** (serif): conteúdo da pessoa (título e corpo da nota, pergunta da revisão). Corpo da nota 18px/1.75, linha máxima de 680px.
- **Instrument Sans**: toda a interface.
- **JetBrains Mono**: só blocos de código.

## Componentes

Button, ModeToggle, Lacuna, MarginQuestion (com trecho citado), SelectionToolbar, Chip, Callout (dúvida), SidebarItem, RatingButtons, Toast, Field, Switch, Skeleton, Wordmark, Motion. Cada um documenta padrão, hover, foco, pressionado, carregando, desabilitado e erro.

## Motion

| Variável | Valor | Uso |
| --- | --- | --- |
| `--dur-instant` | 80ms | pressionar |
| `--dur-fast` | 140ms | hover, foco, cor |
| `--dur-base` | 220ms | revelar lacuna, trocar modo, switch |
| `--dur-slow` | 320ms | entradas, toast |
| `--dur-reveal` | 700ms | abertura do logo |
| `--ease-out` | cubic-bezier(.2,.8,.2,1) | entradas e respostas a clique |
| `--ease-in-out` | cubic-bezier(.4,0,.2,1) | mudança de estado no lugar |

Regras:
- Movimento mostra o que mudou; dentro do editor e da revisão, nada se move sozinho.
- Troca de modo e de tela sem recarregar: a navegação fica, o conteúdo entra deslizando do lado pra onde se foi.
- Revelar lacuna muda só a cor, nunca a largura.
- Animação ao rolar só em página de apresentação.
- `prefers-reduced-motion`: tudo instantâneo, skeleton parado.

### CSS ou Motion?

- **CSS (transições do Tailwind com as `--dur-*`):** hover, foco, pressionado, troca de cor, revelar lacuna, brilho do skeleton. Sem JavaScript.
- **Motion:** quando há saída do elemento, mudança de layout ou sequência orquestrada.

| Caso no Margem | Recurso do Motion |
| --- | --- |
| Trocar modo do Estúdio, Escrever ↔ Estudar, telas sem piscar | `AnimatePresence mode="popLayout"` com direção (entra do lado pra onde se foi) |
| Pílula da navegação deslizando | `layoutId` |
| Itens de prática entrando na margem, um depois do outro | variants com `staggerChildren` |
| Toast, popover, menu do `/` | `AnimatePresence` (entrada e saída) |
| Abertura do logo (M → cantos se afastam → "Margem") | variants em sequência, `--dur-reveal` |
| Animação ao rolar (só páginas de apresentação) | `whileInView`, `viewport={{ once: true }}` |
| Card da revisão virando / próximo card | `AnimatePresence` com `key` do card |

Configuração única no layout raiz:
- `<MotionConfig reducedMotion="user" transition={{ duration: 0.22, ease: [0.2, 0.8, 0.2, 1] }}>`: respeita o sistema e usa os tokens como padrão.
- `LazyMotion` com `domAnimation` e o componente `m` no lugar de `motion`, pra bundle menor no PWA. Carregar `domMax` só em telas com `layoutId`.
- Durações e curvas importadas de um único arquivo de tokens (`packages/ui/motion.ts`), espelhando as variáveis CSS.

## Marca

"Margem" em Literata 600 entre dois cantos em diagonal (embaixo à esquerda, em cima à direita), espessura 0,055em e lado 0,34em. Ícone: o "M" entre os cantos. Abertura: o M aparece e os cantos se afastam revelando o nome, uma vez por sessão. No favicon de 16px, sem cantos.

## Voz

Português do Brasil, frases curtas, tom de colega de estudo. Botão começa com verbo ("Mostrar resposta"). A mesma ação tem o mesmo nome no fluxo todo ("Aprovar" → "Pergunta aprovada"). Erro diz o que houve e o que fazer, sem pedir desculpa. Sem emoji, sem caixa alta, sem exclamação.
