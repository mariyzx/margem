# ADR-009: Fila de jobs com BullMQ, atrás de uma interface

- **Status:** Aceita
- **Data:** 2026-11-23

## Contexto

O Margem precisa de trabalho em segundo plano: processar PDFs, buscar links, gerar embeddings, indexar, gerar práticas e mandar lembretes. É pouco volume, um consumidor por tarefa, com retry, atraso e agendamento. O projeto roda numa única VPS gratuita.

## Decisão

Usar BullMQ sobre o Redis que já existe (cache e adapter do Socket.IO), com `@nestjs/bullmq`. Os módulos usam uma interface `JobQueue` própria, não o BullMQ diretamente. Jobs que falham após as tentativas vão pro conjunto de falhas e são movidos pra uma fila `<nome>-failed` pra investigação, já que o BullMQ não tem fila de mensagens mortas nativa.

## Alternativas consideradas

- RabbitMQ: broker com roteamento e fila de mensagens mortas nativa. Faz sentido com vários serviços reagindo ao mesmo evento. Adiado: seria um serviço a mais pra fazer o que o BullMQ já faz. Pode entrar depois atrás da mesma interface, inclusive como objetivo de aprendizado.
- Kafka: log de eventos pra volume alto e replay. Descartado: pesado demais pra VPS gratuita e não é fila de jobs.

## Consequências

Nenhum serviço novo na infra. Trocar o transporte depois fica restrito à implementação de `JobQueue`. Jobs levam só ids (nunca conteúdo de nota nem chave de IA).
