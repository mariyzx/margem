# Modelo de dados

Esboço de partida pro schema Prisma. Nomes em inglês. Todo modelo tem `id` (cuid), `createdAt` e `updatedAt`; omitidos abaixo.

## Entidades

```
User            email, name, avatarUrl
Session / AuthAccount   (padrão da lib de auth)

Notebook        ownerId → User, name, color (enum de cores de caderno)
Note            notebookId, authorId, title, doc (JSON TipTap), materialOpenedAt?, sourceId?
                // cada bloco no doc tem attrs.blockId (estável) e attrs.origin: 'memory' | 'material'

Anchor          noteId? | sourceChunkId?, blockId, quote (texto citado), prefix, suffix
                // âncora relativa: reencontra o trecho por quote + contexto quando o doc muda;
                // se não achar, status 'orphaned' (pergunta continua visível, sem destaque)

Cloze           noteId, anchorId, active
Question        noteId, anchorId?, authorType ('self' | 'group' | 'ai'), authorId?, text, answer,
                status ('pending' | 'approved' | 'discarded')   // 'pending' só pra authorType 'ai'

Source          notebookId, type ('file' | 'link' | 'text'), title, storageKey?, url?, status
                ('queued' | 'processing' | 'ready' | 'failed'), failureReason?
SourceChunk     sourceId, ord, text, page?, startSec?, endSec?   // embedding fica no Elasticsearch

PracticeItem    notebookId, kind ('quiz' | 'flashcard' | 'cloze' | 'why'), prompt, answer,
                sourceChunkId?, noteId?, createdBy ('self' | 'ai')

ReviewItem      userId, kind ('cloze' | 'question' | 'practice' | 'link'), refId,
                fsrs state: due, stability, difficulty, elapsedDays, scheduledDays, reps, lapses, state, lastReview
ReviewLog       reviewItemId, rating ('again' | 'hard' | 'easy'), reviewedAt, previous state (JSON)

Group           notebookId, name, inviteCode
GroupMember     groupId, userId, role ('owner' | 'member')
GroupTopic      groupId, title, weekStart, weekEnd
GroupTopicNote  topicId, userId, noteId, publishedAt?
                // regra: só lista notas dos outros se o usuário tem publishedAt preenchido nesse tópico

LiveQuiz        groupId, scheduledAt, status
MemoryMap       notebookId, nodes (JSON: noteId/anchorId + posição), edges (JSON: de, para, rótulo)

AiSettings      userId, enabled (bool), promptTarget ('claude' | 'chatgpt' | 'gemini'),
                features (JSON de booleans)   // provedor: o primeiro AiCredential que funcionar, senão 'local'
AiCredential    userId, provider ('openrouter' | 'groq'), encryptedKey, keyLast4, createdAt   // AES-256-GCM, chave mestra em env
AiUsage         userId, feature, provider (inclui 'local'), tokensIn, tokensOut, ok, createdAt
```

## Regras de integridade

- Todo `ReviewItem` aponta pra algo que existe; apagar a origem arquiva o item (não apaga o histórico).
- Pergunta de `authorType: 'group'` só existe dentro de um caderno com turma.
- `Question.status = 'pending'` nunca entra na revisão.
- Notas de um `GroupTopic` só são devolvidas por uma query que confere `publishedAt` do solicitante.

## Índices no Elasticsearch

- `chunks`: texto (analisador português) + `dense_vector` + `sourceId`, `notebookId`, `page`.
- `notes`: blocos da nota como documentos (texto + vetor + `noteId`, `blockId`, `origin`).
