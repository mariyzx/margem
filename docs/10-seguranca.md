# Segurança

Análise de ameaças e controles do Margem. Leia antes de mexer em auth, permissões, IA, upload, links, tempo real ou infra. Os itens marcados como **obrigatório** entram antes de qualquer pessoa além da Mari usar o app.

## O que protegemos

| Ativo | Por que importa |
| --- | --- |
| Notas, fontes e perguntas | Conteúdo pessoal de estudo; pode ter dados de terceiros (aulas, material do trabalho). Dado pessoal pela LGPD. |
| Chaves de IA dos usuários | Dão acesso à conta e à cota de cada pessoa num provedor. Vazou, alguém gasta no nome dela. |
| Sessões e contas | Quem entra na conta vê tudo e entra nas turmas. |
| Turmas | Notas de uma turma não podem vazar pra quem não é membro, nem antes da hora ("publique antes de ver"). |
| A VPS | Um servidor comprometido expõe tudo acima e pode ser usado pra atacar outros. |

## Principais riscos, em ordem de prioridade

1. **Acesso a dado de outra pessoa (IDOR/BOLA)** por um endpoint que busca por id sem conferir dono ou turma.
2. **SSRF** pelo recurso "colar link": o servidor busca a URL e pode ser levado a acessar Redis, Elasticsearch, Ollama ou o endereço de metadados da nuvem.
3. **Serviços internos expostos na internet** (Redis, Elasticsearch, Postgres, Ollama sem senha numa porta pública).
4. **Vazamento de chave de IA** por log, resposta de API ou banco.
5. **XSS** pelo conteúdo da nota, por HTML colado ou pelo texto devolvido pela IA.
6. **Prompt injection** por instruções escondidas em PDFs, páginas ou notas da turma.
7. **Abuso de login por link mágico** (spam de e-mail, enumeração de contas, link reaproveitado).
8. **Upload malicioso** (PDF que trava o parser, arquivo gigante, tipo falso).
9. **Segredo commitado** ou dependência comprometida, mais provável num projeto escrito com agentes de IA.

## Controles por área

### Autenticação — obrigatório
- [ ] Token do link mágico com 32 bytes aleatórios, guardado **só como hash**, uso único, expira em 15 minutos.
- [ ] Resposta igual pra e-mail cadastrado ou não ("se a conta existir, mandamos o link"), pra não revelar quem usa o app.
- [ ] Limite de pedidos de link por e-mail e por IP (ex.: 5 por hora).
  - Por IP: 5 por hora no `POST /auth/magic-link` (throttler), com 429.
  - Por e-mail: 60 s de intervalo entre envios e no máximo 5 por hora. A chave do limite normaliza aliases (minúsculas, sem `+sufixo`; no Gmail, sem pontos e com `googlemail.com` = `gmail.com`). Estourou, responde o mesmo 200 genérico sem enviar, pra não revelar nada sobre o endereço.
  - Teto global: `MAGIC_LINK_DAILY_CAP` e-mails por dia UTC (padrão 300). Acima disso, mesmo 200 genérico e log `auth.magic_link_global_cap_reached` (warn) no máximo uma vez por hora.
  - Pedir um link novo invalida os links ainda válidos daquele e-mail.
- [ ] OAuth com `state` e PKCE.
- [ ] Sessão em cookie `HttpOnly`, `Secure`, `SameSite=Lax`, rotacionada no login. "Sair de todos os aparelhos" disponível.
- [ ] Proteção CSRF nas rotas que mudam dados (token ou checagem de `Origin`), já que a sessão é por cookie.
- [ ] Convites de turma com expiração e revogação; o código é aleatório e longo.

### Autorização — obrigatório
- [ ] Toda query de dado de usuário filtra por dono **ou** por associação à turma, no service (não só no controller).
- [ ] Uma camada de políticas centralizada (guards do NestJS com algo como CASL) em vez de `if` espalhado.
- [ ] A regra "publique antes de ver" fica no back: a API não devolve notas dos outros antes do `publishedAt` do solicitante.
- [ ] Hocuspocus autentica a conexão e confere permissão **por documento**. Socket.IO só entra em sala de turma de quem é membro.
- [ ] Ids não sequenciais (cuid), mas sem depender disso como segurança.
- [ ] Teste e2e pra cada recurso: usuário B tentando ler, editar e apagar recurso do usuário A recebe 404.

### Chaves de IA — obrigatório
- [ ] AES-256-GCM, IV aleatório por registro, chave mestra em variável de ambiente fora do repositório.
  - `AI_KEYS_MASTER_KEY`: base64 de exatamente 32 bytes (`openssl rand -base64 32`). A API não sobe em produção sem ela; em dev, salvar chave responde 503 `ai_keys_unavailable`.
  - `AiCredential.encryptedKey` guarda o envelope `v1.<iv>.<authTag>.<cifrado>` (base64; IV de 12 bytes, tag de 16). Código em `apps/api/src/ai/credential-cipher.ts`.
  - O AAD é `userId:provider`: um envelope copiado pra linha de outra pessoa não descriptografa.
  - Salvar e remover chave gravam `ai_credential.saved` / `ai_credential.removed` no AuditLog, só com o `provider`.
- [ ] Descriptografar só dentro do `AiService`, na hora da chamada. Nunca em log, erro, resposta, analytics ou fila (o job leva o `userId`, não a chave).
- [ ] API devolve só `keyLast4`. "Remover" apaga o registro.
- [ ] Plano de rotação da chave mestra documentado (re-criptografar em lote).
  - **Quando:** só se a chave vazar ou o servidor for comprometido. Perder a chave sem rotação deixa todas as chaves salvas ilegíveis: as pessoas precisam colar de novo.
  - **Como:** o prefixo do envelope (`v1`) diz com qual chave mestra ele foi feito. Para rodar: (1) gerar a nova chave; (2) a API passa a aceitar as duas, decifrando `v1` com a antiga e cifrando tudo novo como `v2`; (3) um script, rodando no container da API, re-cifra em lote cada `AiCredential` de `v1` para `v2`, linha a linha, numa transação por linha; (4) quando não restar `v1`, tirar a chave antiga do ambiente.
  - `TODO(decisão)`: o suporte a duas chaves (passo 2) e o script (passo 3) ainda não existem; escrever quando a primeira rotação for necessária.
- [ ] Login do OpenRouter com OAuth PKCE; o token recebido tem o mesmo tratamento de uma chave.
  - `state` e `code_verifier` aleatórios (32 bytes), no Redis por 10 min com o `userId`, uso único (`GETDEL`); outra pessoa ou `state` repetido → 400 `oauth_state_invalid`. O `code` sai da URL na página de retorno; o front só segue URL de autorização em `https://openrouter.ai`.

### Busca de links (SSRF) — obrigatório antes de liberar "colar link"
- [ ] Só `http` e `https`.
- [ ] Resolver o DNS e **bloquear** loopback, redes privadas, link-local (inclui `169.254.169.254`), CGNAT e IPv6 equivalentes. Conferir de novo a cada redirect (no máximo 3).
- [ ] Conectar no IP já validado, pra evitar troca de DNS entre checagem e acesso.
- [ ] Timeout curto, limite de tamanho da resposta e só tipos de conteúdo esperados.
- [ ] O worker que busca links roda num container **sem acesso à rede interna** do Compose (rede própria, só saída pra internet).

### Conteúdo e XSS — obrigatório
- [ ] Nota guardada como JSON do TipTap e renderizada pelo schema, nunca como HTML cru.
- [ ] HTML colado passa pelo parser do editor (só nós e marcas permitidos).
- [ ] Texto da IA renderizado como texto ou como Markdown com sanitização (sem HTML, sem `javascript:`).
- [ ] Nada de `dangerouslySetInnerHTML` sem sanitização explícita e revisada.
- [ ] Links com `rel="noopener noreferrer"`.
- [ ] Cabeçalhos: CSP restritiva (sem `unsafe-inline` em script), `X-Content-Type-Options`, `Referrer-Policy`, `frame-ancestors 'none'`, HSTS.

### Prompt injection e saída da IA
- [ ] Texto da nota, da fonte e da turma entra no prompt **delimitado e marcado como dado**, nunca como instrução.
- [ ] A IA não tem ferramentas nem ações: só devolve texto ou JSON.
- [ ] Toda saída estruturada é validada com Zod; o que não passa é descartado.
- [ ] Citações de "Pergunte ao caderno" são conferidas contra os ids que estavam no contexto.
- [ ] Saída da IA nunca vira escrita direta na nota (ADR-001) e sugestões passam por aprovação.
- [ ] Busca no RAG sempre filtrada pelo caderno e pelas permissões de quem pergunta, pra que trechos de outro usuário nunca entrem no contexto.

### Upload de arquivos — obrigatório
- [ ] Limite de tamanho (ex.: 25 MB) e cota de armazenamento por usuário (o Object Storage gratuito é pequeno).
  - PDF até 25 MB (`MAX_PDF_BYTES`). O Caddy aceita 26 MB só em `POST /api/sources/file`; o resto continua em 1 MB.
  - Cota de espaço: soma de `Source.sizeBytes` dos PDFs da pessoa, **incluindo os apagados** (o objeto continua no bucket), contra `MAX_SOURCE_STORAGE_MB_PER_USER` (padrão 500). Estourou, 422 `quota_exceeded` com `resource: "storage"` e `limit` em MB, antes de subir o arquivo.
- [ ] Tipo conferido pelo conteúdo, não pela extensão.
- [ ] Bucket privado; download só por URL assinada de curta duração, depois de checar permissão.
  - Bucket de upload (`S3_BUCKET`) separado do de backup (`BACKUP_S3_BUCKET`), sem fallback entre eles: sem `S3_BUCKET`, o upload responde 503. O container da API não recebe `BACKUP_S3_*`.
  - `TODO(decisão)`: a API e o script de backup ainda usam a mesma chave (`AWS_*`), então uma API comprometida alcança os backups. Para isolar de verdade, crie uma chave com acesso só ao bucket de upload.
  - Se o insert da fonte falhar depois do upload, o objeto é apagado na hora.
- [ ] Nome original guardado como metadado, nunca usado como caminho.
- [ ] Parsing no worker com timeout e limite de memória; falhou, a fonte fica `failed` com motivo.
  - O pdf.js roda numa `worker_thread` com heap de 256 MB e é encerrado (`terminate()`) depois de 30 s, então um PDF hostil não trava o event loop da API.
  - `TODO(decisão)`: mover a fila de ingestão para um container próprio, sem a rede `internal`, como pede a seção de SSRF.

### Abuso e disponibilidade
- [ ] Limite de taxa global e por usuário (throttler do NestJS com Redis), mais apertado em login, upload, link e IA.
  - `default`: 60 req/min por IP **em cada rota**. `global-ip`: 300 req/min por IP somando todas as rotas. Contadores no Redis com `INCR` + `PEXPIRE NX` atômicos (exige Redis 7+).
- [ ] Limite de chamadas de IA por usuário pra proteger a cota dele.
- [ ] Limite de tamanho de nota, de fonte e de mensagens no quiz ao vivo.
  - Corpo da requisição: 1 MB no Caddy (`request_body`) e no Node (JSON e urlencoded). Caddy: `read_header` 10s, `read_body` 30s, `idle` 2m, cabeçalhos até 16 KB, keepalive com a API de 60s. Node: `headersTimeout` 15s, `requestTimeout` 45s, `keepAliveTimeout` 65s.
  - Listas paginadas por cursor (`?limit=` padrão 50, máximo 100; `?cursor=` é o id do último item). `GET /notebooks` traz até 100 notas por caderno com `hasMoreNotes`; o resto vem de `GET /notebooks/:id/notes`.
  - Tetos por usuário (env): 100 cadernos, 5.000 notas, 500 materiais, 10.000 perguntas. Acima disso, 422 `quota_exceeded`.
  - Sessão: a API só consulta o banco depois do CSRF e do throttler (`SessionGuard`), e só em rotas com `@RequirePolicy`. No máximo 10 sessões ativas por usuário; a mais antiga é revogada.
  - Limpeza diária às 03:30 (America/Sao_Paulo), com lock no Redis: tokens de link expirados ou usados há mais de 24h e sessões expiradas há mais de 7 dias, em lotes de 1.000.

### Infra (VPS) — obrigatório
- [ ] SSH só por chave, sem senha nem root; de preferência só pela Tailscale.
- [ ] Firewall (ufw e lista de segurança da Oracle) liberando só 80 e 443 públicos.
- [ ] Postgres, Redis, Elasticsearch e Ollama **sem porta publicada** no Compose: só na rede interna.
- [ ] Redis com senha; Elasticsearch com segurança ligada (usuário e senha).
- [ ] Containers sem root, imagens com versão fixa, `unattended-upgrades` no Ubuntu, fail2ban.
- [ ] Segredos num `.env` fora do repositório (e nos secrets do GitHub Actions), com permissão restrita.
- [ ] Backup diário criptografado do Postgres no Object Storage, com teste de restauração.

### Código e cadeia de dependências
- [ ] gitleaks (ou o secret scanning do GitHub) no CI e num hook de pre-commit.
- [ ] Dependabot ou Renovate, `pnpm audit` no CI, lockfile sempre commitado.
- [ ] CodeQL ou Semgrep no CI.
- [ ] Agentes de IA nunca escrevem segredos em arquivos, não desligam verificações de segurança e marcam no PR qualquer mudança em auth, permissão ou criptografia, pra revisão humana.

### Privacidade e LGPD
- [ ] Página de privacidade simples: o que é guardado, onde (Brasil, Oracle São Paulo) e que, com IA ligada, o conteúdo enviado vai pro provedor escolhido pela pessoa.
- [ ] Aviso na configuração de IA: alguns planos gratuitos podem usar o conteúdo pra treinar modelos.
- [ ] Exportar os próprios dados e apagar a conta (apaga notas, fontes, chaves, arquivos e embeddings).
- [ ] Logs sem conteúdo de nota, sem prompt e sem chave; retenção curta.
- [ ] Registro de auditoria pra ações sensíveis: login, troca de chave de IA, exclusão de conta, mudança de membros da turma.

## Checklist de PR (segurança)

- [ ] Endpoint novo usa a camada de políticas e tem teste de acesso indevido?
- [ ] Algum dado de usuário vai pra log, fila ou resposta sem necessidade?
- [ ] Alguma entrada externa (link, arquivo, HTML, texto da IA) é usada sem validação ou sanitização?
- [ ] Mudou auth, permissão, criptografia ou infra? Marque para revisão humana.
