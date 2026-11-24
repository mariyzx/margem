# Pesquisa de aprendizagem: o que sustenta o produto

Resumo da pesquisa feita em nov/2026. Versão completa, com tabela e fontes: https://claude.ai/artifact/65v5zmBBuDcPm7C4B18pCJ

## O essencial

- **Utilidade alta:** testar a si mesmo (recuperação) e prática espaçada. São o centro do Margem.
- **Utilidade média:** interrogação elaborativa ("por quê?"), autoexplicação e prática intercalada.
- **Utilidade baixa:** resumir, grifar, reler, mnemônico de palavra-chave e imagens mentais.
- Fonte principal: Dunlosky et al. (2013), "Improving Students' Learning With Effective Learning Techniques".

## Achados que viraram regra de produto

| Achado | Regra no Margem |
| --- | --- |
| Testes que pedem resposta gerada (lembrar, escrever) funcionam melhor que reconhecimento (múltipla escolha, completar) | A lacuna é porta de entrada; o app incentiva resposta escrita. O quiz do Estúdio pede pra tentar de cabeça antes de mostrar opções. |
| Gerar o conteúdo com as próprias palavras melhora o aprendizado em relação a ler (Schindler & Richter, 2023, g = 0,41) | A nota é sempre escrita pela pessoa. A IA não escreve nota. |
| Criar e responder as próprias perguntas não foi melhor que responder perguntas prontas (Myers, Hausman & Rhodes) | A revisão mistura perguntas suas, da turma e da IA. |
| Recuperação rende mais que montar mapa conceitual (Karpicke & Blunt, 2011; reanálise aponta efeito menor) | O canvas vira "mapa de memória": blocos e ligações escondidos pra completar de cabeça. |
| Intercalar ajuda (g = 0,42), mas varia muito e pede cautela com texto expositivo e vocabulário (Brunmair & Richter, 2019) | A revisão mistura temas parecidos da mesma matéria, sem embaralhar tudo. |
| Espaçar rende mais que concentrar (meta-análise de 2021, g = 0,74) | Agendamento com FSRS (`ts-fsrs`). |
| IA sem limites aumentou acertos na prática (+48%) e piorou a prova (-17%) (Bastani et al., PNAS 2025) | A IA não dá resposta antes da tentativa. |
| IA ajuda quando o aluno pede explicação e atrapalha quando pede a solução (Lehmann et al.) | A IA explica depois do erro e faz perguntas; não resolve. |

## Como aplicar ao implementar

- Toda tela de estudo segue a ordem: **tentar → revelar → avaliar → agendar**.
- Nada revela a resposta antes de a pessoa ter tido a chance de tentar.
- Toda prática gerada vira item de revisão com a mesma fila FSRS.
- Escrever a nota segue **de memória primeiro, material depois**, na mesma nota (ver `02-funcionalidades.md`, Nova nota).
- Resumo gerado por IA só fica disponível depois que a pessoa escreveu a própria nota daquela fonte.
