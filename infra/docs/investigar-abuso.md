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

**Ninguém guarda IP puro.** O `ipHash` é um HMAC-SHA256 do IP (IPv6 reduzido ao /64) com a chave `LOG_HASH_SECRET`, truncado em 16 hex. Ele serve para correlacionar eventos, não para descobrir o IP. Para ir do hash ao IP, veja [Banir um cliente](#banir-um-cliente).

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

Para achar o `emailHash` de um endereço conhecido (por exemplo, de quem reclamou de spam):

```bash
dc exec api node -e '
const { createHmac } = require("node:crypto");
const email = process.argv[1].trim().toLowerCase();
console.log(createHmac("sha256", process.env.LOG_HASH_SECRET).update(email).digest("hex").slice(0, 16));
' "pessoa@exemplo.com"
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

**Atenção: `ufw deny` não funciona aqui.** O Docker publica as portas 80/443 do Caddy com regras próprias de iptables, que passam antes das do ufw. Bloqueie na chain `DOCKER-USER`, que o Docker consulta primeiro:

```bash
sudo iptables -I DOCKER-USER -s 203.0.113.7 -j DROP          # um IP
sudo iptables -I DOCKER-USER -s 203.0.113.0/24 -j DROP       # a faixa /24 que aparece no log do Caddy
sudo ip6tables -I DOCKER-USER -s 2001:db8:abcd:12::/64 -j DROP
sudo netfilter-persistent save                               # sobreviver ao reboot (pacote iptables-persistent)

# Desfazer
sudo iptables -D DOCKER-USER -s 203.0.113.7 -j DROP
```

Para bloquear antes de chegar na VPS, use também a Security List da Oracle.

### Do ipHash ao IP

O hash não é reversível de propósito. Com o ataque em andamento, compare o hash com quem está conectado agora:

```bash
# IPs com conexão aberta no 443 agora
sudo ss -Htn state established '( sport = :443 )' | awk '{print $4}' | sed -E 's/:[0-9]+$//; s/^\[|\]$//g' | sort -u > /tmp/ips.txt

# Hash de cada um, com a mesma regra da API (IPv6 reduzido ao /64)
dc exec -T api node -e '
const { createHmac } = require("node:crypto");
const { isIPv6 } = require("node:net");
const norm = (ip) => {
  ip = ip.replace(/^::ffff:/, "");
  if (!isIPv6(ip)) return ip;
  const [h, t] = ip.split("::"); const l = h ? h.split(":") : []; const r = t ? t.split(":") : [];
  const g = [...l, ...Array(t === undefined ? 0 : 8 - l.length - r.length).fill("0"), ...r].map((x) => x.padStart(4, "0"));
  return g.slice(0, 4).join(":") + "::/64";
};
for (const ip of require("node:fs").readFileSync(0, "utf8").split("\n").filter(Boolean)) {
  console.log(createHmac("sha256", process.env.LOG_HASH_SECRET).update(norm(ip)).digest("hex").slice(0, 16), ip);
}' < /tmp/ips.txt | grep '<ipHash>'

rm /tmp/ips.txt
```

Se o ataque já parou, use a faixa `/24` (ou `/64`) do access log do Caddy no mesmo horário.

## Depois do incidente

- Volte `MAGIC_LINK_DAILY_CAP` ao valor normal (no `.env` e no `ENV_PRODUCTION`).
- Revise as regras de `DOCKER-USER` e remova bloqueios temporários.
- Se trocar a `LOG_HASH_SECRET`, os `ipHash`/`emailHash` antigos deixam de bater com os novos. Só troque se ela vazar.
