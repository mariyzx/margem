# Blocklist do Caddy

Bloqueios **permanentes** de IP. Os arquivos `*.caddy` desta pasta ficam **só na VPS**: o `.gitignore` os exclui, porque IP de quem atacou é dado pessoal e o repositório é público. O `git pull` do deploy não apaga arquivos ignorados, então os bloqueios sobrevivem a deploys e reboots.

Como usar, quando bloquear e como desfazer: [`infra/docs/investigar-abuso.md`](../../docs/investigar-abuso.md#3-bloqueio-permanente-blocklist-do-caddy).

Formato de cada arquivo (um por incidente, com o nome do matcher único):

```caddyfile
# 2026-11-26: pedidos de link em massa (ipHash 3f2a9c1d8e7b6a50)
@blocked_20261126 remote_ip 203.0.113.77 198.51.100.0/24 2001:db8:abcd:12::/64
handle @blocked_20261126 {
	abort
}
```

Use `handle` + `abort`. Um `abort` solto não funciona: o Caddy o ordena depois dos `handle` do site, e a requisição já teria sido respondida.
