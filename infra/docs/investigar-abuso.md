# Investigar abuso

Runbook para quando algo parece errado: pico de e-mails de link, muitos 429, conta sendo alvo de tentativas. Todos os comandos rodam **na VPS**, no diretório do app.

```bash
cd "$VPS_APP_DIR"   # onde está o .env de produção
alias dc='docker compose --env-file .env -f infra/docker-compose.prod.yml'
```

## O que existe para olhar

| Fonte | O que tem | Retenção |
| --- | --- | --- |
| Logs da API (`dc logs api`) | JSON do pino. Eventos `security.*`, `auth.*`, `maintenance.*` | 5 arquivos × 10 MB por container (`logging` no compose) |
| Access log do Caddy (`dc logs caddy`) | Uma linha JSON por requisição: IP mascarado (/24 ou /64), URI sem `token`/`code`/`state`, sem cookies | Igual |
| Tabela `AuditLog` | Logins, logouts, pedidos de link, falhas de verificação e do Google, com `ipHash` e `userAgent` | `AUDIT_RETENTION_DAYS` (padrão 90), apagada pelo job das 03:30 |
| Redis `security:daily:<AAAA-MM-DD>` | Contadores do dia (UTC) | Lidos, logados e apagados às 03:30 |
| `infra/caddy/blocklist/*.caddy` (só na VPS) | IPs bloqueados de forma permanente | Até você apagar |

**Ninguém guarda IP puro.** O `ipHash` é um HMAC-SHA256 do IP (IPv6 reduzido ao /64) com a chave `LOG_HASH_SECRET`, truncado em 16 hex. Ele serve para correlacionar eventos, não para descobrir o IP. Para ir do hash ao IP, veja [Do ipHash ao IP](#1-do-iphash-ao-ip).

## Eventos nos logs

Os logs da API são JSON; o nome do evento fica em `msg`. `jq` ajuda, mas `grep` resolve.

```bash
# 429 (um log por ipHash + rota a cada 5 min; o total está nos contadores)
dc logs api --since 1h --no-log-prefix | grep '"msg":"security.rate_limited"' | jq -c '{time, route, throttler, ipHash}'

# CSRF bloqueado (reason: foreign_origin | foreign_referer | invalid_referer | missing_origin)
dc logs api --since 24h --no-log-prefix | grep '"msg":"security.csrf_blocked"' | jq -c '{time, route, reason, ipHash}'

# Teto por usuário atingido (422)
dc logs api --since 24h --no-log-prefix | grep '"msg":"security.quota_exceeded"' | jq -c '{time, route, resource, limit, ipHash}'

# Teto global de links do dia atingido (no máximo 1 log por hora)
dc logs api --since 48h --no-log-prefix | grep '"msg":"auth.magic_link_global_cap_reached"'

# Resumo do dia anterior (emitido às 03:30 de São Paulo)
dc logs api --since 72h --no-log-prefix | grep '"msg":"security.daily_summary"' | jq .

# Limpeza noturna: quantos registros foram apagados
dc logs api --since 72h --no-log-prefix | grep '"msg":"maintenance.auth_cleanup_done"' | jq -c '{time, magicLinkTokens, sessions, auditLogs}'

# Falhas de SMTP no envio do link
dc logs api --since 24h --no-log-prefix | grep '"msg":"auth.magic_link_failed"' | jq -c '{time, code, responseCode}'

# Erros de escrita no AuditLog (o fluxo segue, mas o registro se perdeu)
dc logs api --since 24h --no-log-prefix | grep '"msg":"audit.write_failed"'
```

Contadores de **hoje**, antes do resumo noturno:

```bash
dc exec redis sh -c 'REDISCLI_AUTH="$REDIS_PASSWORD" redis-cli HGETALL "security:daily:$(date -u +%F)"'
```

Access log do Caddy, por rota e status:

```bash
# Requisições por status na última hora
dc logs caddy --since 1h --no-log-prefix | grep http.log.access | jq -r '.status' | sort | uniq -c | sort -rn

# Faixas de IP (/24) que mais pediram link mágico na última hora
dc logs caddy --since 1h --no-log-prefix | grep http.log.access \
  | jq -r 'select(.request.uri | startswith("/api/auth/magic-link")) | .request.remote_ip' \
  | sort | uniq -c | sort -rn | head
```

## Consultas no AuditLog

```bash
dc exec postgres sh -c 'psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"'
```

```sql
-- Quem mais pediu link na última hora (e para quantos e-mails diferentes)
SELECT "ipHash",
       count(*)                                              AS pedidos,
       count(*) FILTER (WHERE metadata->>'outcome' = 'sent') AS enviados,
       count(DISTINCT metadata->>'emailHash')                AS emails_distintos
FROM "AuditLog"
WHERE action = 'auth.magic_link_requested'
  AND "createdAt" > now() - interval '1 hour'
GROUP BY "ipHash"
ORDER BY pedidos DESC
LIMIT 20;

-- E-mails mais visados na última hora (bombardeio de uma caixa só)
SELECT metadata->>'emailHash' AS email_hash,
       count(*)               AS pedidos,
       count(DISTINCT "ipHash") AS ips_distintos
FROM "AuditLog"
WHERE action = 'auth.magic_link_requested'
  AND "createdAt" > now() - interval '1 hour'
GROUP BY 1
ORDER BY pedidos DESC
LIMIT 20;

-- Resultado dos pedidos de link por dia
SELECT date_trunc('day', "createdAt") AS dia, metadata->>'outcome' AS resultado, count(*)
FROM "AuditLog"
WHERE action = 'auth.magic_link_requested'
GROUP BY 1, 2
ORDER BY 1 DESC, 3 DESC;

-- Falhas de verificação por motivo (invalid | expired | used), últimas 24h
SELECT metadata->>'reason' AS motivo, count(*)
FROM "AuditLog"
WHERE action = 'auth.magic_link_verify_failed'
  AND "createdAt" > now() - interval '24 hours'
GROUP BY 1
ORDER BY 2 DESC;

-- Falhas do Google por motivo (state_mismatch | email_not_verified | token_invalid)
SELECT metadata->>'reason' AS motivo, count(*)
FROM "AuditLog"
WHERE action = 'auth.google_failed'
  AND "createdAt" > now() - interval '24 hours'
GROUP BY 1;

-- Logins por dia e método
SELECT date_trunc('day', "createdAt") AS dia, metadata->>'method' AS metodo, count(*)
FROM "AuditLog"
WHERE action = 'auth.login'
GROUP BY 1, 2
ORDER BY 1 DESC;

-- Tudo o que um ipHash fez nas últimas 24h
SELECT "createdAt", action, "userId", metadata, "userAgent"
FROM "AuditLog"
WHERE "ipHash" = '<ipHash>'
  AND "createdAt" > now() - interval '24 hours'
ORDER BY "createdAt" DESC;
```

## O que fazer em cada cenário

### Muitos e-mails de link saindo (spam ou bombardeio)

Sinais: `magic_link.sent` alto no `daily_summary`, `auth.magic_link_global_cap_reached` nos logs, aviso do provedor SMTP.

1. Veja se é um ipHash só ou muitos (primeira consulta acima) e se é um e-mail só ou muitos (segunda consulta).
2. **Baixe o teto global** enquanto investiga. Edite `MAGIC_LINK_DAILY_CAP` no `.env` da VPS **e** no secret `ENV_PRODUCTION` (senão o próximo deploy volta o valor antigo) e reinicie só a API:
   ```bash
   dc up -d api
   ```
   Acima do teto, a API continua respondendo o 200 genérico, mas não envia nada. Quem já tem sessão não é afetado; o login pelo Google continua funcionando.
3. Se for uma origem só, [bana o cliente](#banir-um-cliente).

### Um e-mail específico recebendo links que a pessoa não pediu

O limite por e-mail (60 s entre envios, 5 por hora, aliases do Gmail contam juntos) já segura a quantidade. Confirme com a consulta de e-mails mais visados. Se vier de um ipHash só, bana o cliente. Os links não dão acesso a ninguém além do dono da caixa.

### Muitas falhas de verificação

- `invalid` em volume: alguém tentando adivinhar tokens. São 256 bits, então não vai acertar, mas o `/auth/verify` está limitado a 10/min por IP. Veja os 429 desse ipHash e bana se insistir.
- `expired` ou `used` em volume: costuma ser usuário real (abriu o link tarde, ou o cliente de e-mail "pré-abriu" o link). Se for `used` logo depois de `sent`, suspeite de scanner de link no provedor de e-mail do usuário.

### Muitos 429

Veja o `throttler` no log: `default` é 60/min por rota, `global-ip` é 300/min somando todas as rotas. Um ipHash com `global-ip` repetido é robô. Muitos ipHash diferentes no mesmo minuto é ataque distribuído: os limites aguentam, mas acompanhe a CPU (`docker stats`) e o access log do Caddy.

### Muitos `quota_exceeded`

Uma conta criando itens em loop. Ache o `userId` pelo AuditLog (`action` = `notebook.created`, `note.created` etc.) e decida se é uso legítimo (aumente o teto daquele recurso no env) ou abuso.

### CSRF bloqueado

`foreign_origin` em volume indica uma página de terceiros tentando usar a sessão de quem a visita. A proteção já barrou; anote a `route` e veja se há algum link para o Margem sendo divulgado fora do app.

## Banir um cliente

São três passos: **achar o IP** a partir do `ipHash`, **bloquear rápido** com iptables e, se for preciso que o bloqueio dure, **bloquear de forma permanente** no Caddy.

| | iptables `DOCKER-USER` | Blocklist do Caddy |
| --- | --- | --- |
| Para quê | Conter o ataque agora | Manter o bloqueio |
| Sobrevive a reboot? | **Não** | Sim |
| Sobrevive a deploy? | Sim | Sim (o arquivo fica só na VPS, fora do git) |
| Onde corta | Antes de chegar ao Caddy (pacote descartado) | No Caddy (conexão encerrada sem resposta) |

**A Security List da Oracle não serve para isso:** as regras de Security List e de NSG da OCI só *permitem* tráfego. Não existe regra de "negar este IP".

### 1. Do ipHash ao IP

O hash não é reversível de propósito. O caminho é gerar candidatos e calcular o hash de cada um **com o mesmo código da API**: o script `find-ip-by-hash` chama o `clientFingerprint()` da própria aplicação, então a normalização (IPv4 mapeado em IPv6, IPv6 reduzido ao /64) nunca diverge do que foi logado. Ele roda dentro do container da API, onde está a `LOG_HASH_SECRET`. Sem a chave, o `/24` do log e o `ipHash` não se cruzam.

**Caminho principal: as faixas do access log do Caddy.** Funciona mesmo depois que o ataque parou, enquanto o log existir (5 × 10 MB). O Caddy registra o IP mascarado em `/24`, e um `/24` tem só 256 endereços. O script testa todos.

```bash
# Faixas que bateram no endpoint atacado, na janela do ataque (ajuste --since e o caminho)
dc logs caddy --since 2h --no-log-prefix | grep http.log.access \
  | jq -r 'select(.request.uri | startswith("/api/auth/magic-link")) | .request.remote_ip' \
  | sort -u > /tmp/faixas.txt

dc exec -T api node apps/api/dist/scripts/find-ip-by-hash.js '<ipHash>' < /tmp/faixas.txt
rm /tmp/faixas.txt
```

A saída é o IP exato (IPv4) ou o `/64` (IPv6). No stderr aparecem quantos candidatos foram testados e as linhas que não eram IP. Sem correspondência, o script sai com código 1 e diz por quê. Não é uma falha silenciosa.

**Alternativa com o ataque em andamento: as conexões abertas agora.** O `ss` precisa rodar na rede do container do Caddy. Com o Docker publicando a 443, a conexão do cliente é redirecionada (DNAT) para dentro do container, e o `ss` do host não a mostra.

```bash
CADDY_PID=$(docker inspect -f '{{.State.Pid}}' "$(dc ps -q caddy)")
sudo nsenter -t "$CADDY_PID" -n ss -Htn state established '( sport = :443 )' \
  | awk '{print $4}' | sed -E 's/:[0-9]+$//; s/^\[|\]$//g' | sort -u \
  | dc exec -T api node apps/api/dist/scripts/find-ip-by-hash.js '<ipHash>'
```

**Se nada bater, confira o IPv6.** Se a VPS tem IPv6 e o Docker não está com IPv6 habilitado, as conexões IPv6 passam pelo `docker-proxy`, e o Caddy e a API veem o IP interno do Docker (`172.x`) no lugar do cliente. Todos os clientes IPv6 viram um só: mesmo `ipHash` e mesmo rate limit. Sinal disso: `remote_ip` começando com `172.` no access log. Nesse caso, nem o hash nem o log levam ao IP real, e o bloqueio também muda:

- **Achar o IP:** o `docker-proxy` aceita a conexão no host, então o `ss` do **host** (sem `nsenter`) mostra o IPv6 real. Não dá para ligar esse IP ao `ipHash`; escolha pelo volume de conexões.
- **Bloquear:** a conexão chega ao host, não ao container, então a regra vai na chain `INPUT` (`sudo ip6tables -I INPUT -s <ipv6>/64 -j DROP`), não na `DOCKER-USER`. A blocklist do Caddy não ajuda, porque o Caddy só vê `172.x`.
- **Resolver de vez:** habilite IPv6 no Docker (`daemon.json` com `"ipv6": true` e uma rede IPv6 no compose), para o Caddy voltar a ver o IP real.

Para achar o `emailHash` de um endereço conhecido (por exemplo, de quem reclamou de spam), use o script equivalente, que também usa o helper da API:

```bash
dc exec -T api node apps/api/dist/scripts/hash-email.js "pessoa@exemplo.com"
```

### 2. Bloqueio rápido (temporário): iptables `DOCKER-USER`

**Atenção: `ufw deny` não funciona aqui.** O Docker publica as portas 80/443 do Caddy com regras próprias de iptables, que passam antes das do ufw. A chain `DOCKER-USER` é consultada antes delas.

```bash
sudo iptables -I DOCKER-USER -s 203.0.113.77 -j DROP            # um IP
sudo iptables -I DOCKER-USER -s 203.0.113.0/24 -j DROP          # a faixa inteira, se o ataque roda nela
sudo ip6tables -I DOCKER-USER -s 2001:db8:abcd:12::/64 -j DROP  # IPv6: sempre o /64

sudo iptables -L DOCKER-USER -n -v --line-numbers               # conferir (a coluna pkts deve subir)
```

**Essas regras somem no reboot.** O `iptables-persistent` não está instalado (foi removido na configuração da VPS), e a VPS reinicia sozinha às 04:30 quando há atualização de kernel. Trate o iptables como contenção de horas. Se o bloqueio precisa durar, faça também o passo 3.

#### Desfazer um bloqueio no iptables

Bloqueou o IP errado? Remova a regra com **exatamente** os mesmos parâmetros usados para criá-la:

```bash
sudo iptables -D DOCKER-USER -s 203.0.113.77 -j DROP
sudo ip6tables -D DOCKER-USER -s 2001:db8:abcd:12::/64 -j DROP
```

Ou pelo número da linha:

```bash
sudo iptables -L DOCKER-USER -n --line-numbers
sudo iptables -D DOCKER-USER 1     # o número da regra DROP que você criou
```

Não apague a regra `RETURN` que o Docker mantém no fim da chain. Se a regra não existir mais (a VPS reiniciou), o `-D` responde `Bad rule` e não há nada a desfazer.

### 3. Bloqueio permanente: blocklist do Caddy

Os arquivos `infra/caddy/blocklist/*.caddy` ficam **só na VPS** (o `.gitignore` os exclui, porque IP de quem atacou é dado pessoal e o repositório é público). O Caddyfile importa todos eles. Crie um arquivo por incidente:

```bash
cat > infra/caddy/blocklist/20261126-links.caddy <<'EOF'
# 2026-11-26: pedidos de link em massa (ipHash 3f2a9c1d8e7b6a50)
@blocked_20261126_links remote_ip 203.0.113.77 2001:db8:abcd:12::/64
handle @blocked_20261126_links {
	abort
}
EOF

dc exec caddy caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile
```

- O nome do matcher (`@blocked_...`) precisa ser único entre os arquivos.
- Use `handle` + `abort`. Um `abort` solto não funciona: o Caddy o ordena depois dos `handle` do site, e a requisição já teria sido respondida.
- Se o arquivo tiver erro, o `reload` falha e o Caddy **mantém a configuração anterior**. Leia a mensagem e corrija.
- Para conferir, procure a faixa no access log: depois do reload, ela não deve aparecer mais com `status` 200.

#### Desfazer um bloqueio no Caddy

```bash
rm infra/caddy/blocklist/20261126-links.caddy     # ou edite e tire só o IP errado
dc exec caddy caddy reload --config /etc/caddy/Caddyfile --adapter caddyfile
```

## Depois do incidente

- Volte `MAGIC_LINK_DAILY_CAP` ao valor normal (no `.env` e no `ENV_PRODUCTION`).
- Remova as regras temporárias de `DOCKER-USER` (`sudo iptables -L DOCKER-USER -n --line-numbers`), se a VPS ainda não reiniciou.
- Revise `infra/caddy/blocklist/` de tempos em tempos. Bloqueio permanente de IP envelhece mal, porque IP muda de dono. Anote no comentário de cada arquivo a data e o motivo.
- Se trocar a `LOG_HASH_SECRET`, os `ipHash`/`emailHash` antigos deixam de bater com os novos. Só troque se ela vazar.
