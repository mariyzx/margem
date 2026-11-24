# ADR-011: Tailwind + Radix/shadcn + Motion como base de interface

- **Status:** Aceita
- **Data:** 2026-11-23

## Contexto

O design system do Margem define tokens, todos os estados de cada componente (incluindo carregando e desabilitado), skeletons e um guia de movimento. No protótipo, trocar de modo no Estúdio fazia a tela piscar porque o conteúdo era recriado sem transição de saída. A interface precisa ser acessível (teclado, leitores de tela, "reduzir movimento"), leve no celular (PWA) e implementada em boa parte por agentes de IA, então as escolhas têm que ser poucas e claras.

## Decisão

- **Tailwind v4** com os tokens como variáveis CSS, mais **cva** e **tailwind-merge** pras variantes.
- **Radix UI**, trazido pelo **shadcn/ui** pra dentro de `packages/ui` e restilizado com os tokens, pros componentes interativos.
- **Lucide** pros ícones e **next/font** pras fontes.
- **Motion** como única lib de animação, com `MotionConfig reducedMotion="user"` e `LazyMotion` no layout raiz.
- Regra: micro-estados em CSS; saída, layout e sequência no Motion.

## Alternativas consideradas

- CSS Modules ou styled-components: menos usados hoje em projetos Next.js novos e sem o atalho dos tokens como utilitários.
- MUI, Chakra ou Mantine: visual e tema próprios brigam com o design system; customizar a fundo dá mais trabalho que restilizar o shadcn.
- Headless UI ou React Aria no lugar do Radix: boas opções; Radix ganhou pelo ecossistema do shadcn e por ser o mais comum no mercado.
- GSAP: ótimo pra timelines complexas, mas o Margem não precisa disso; misturar com Motion deixaria o movimento inconsistente.
- Só CSS (incluindo View Transitions): resolve micro-estados, mas animação de saída e de layout em React fica frágil.
- App nativo no futuro (Expo): equivalentes seriam Reanimated e NativeWind; decidir num ADR próprio se acontecer.

## Consequências

Poucas libs, todas comuns no mercado (bom pro portfólio). O código do shadcn fica no repo e é nosso pra manter. Agentes têm uma tabela de "qual recurso pra qual caso" em `docs/07-design-system.md`, o que reduz animações inventadas. Qualquer lib nova de estilo ou animação exige um ADR.
