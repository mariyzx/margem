# Hardening da VPS (Oracle Always Free ARM — Ubuntu)

Checklist obrigatório antes de expor o app ([10-seguranca.md](../docs/10-seguranca.md)):

1. **SSH somente por chave:**
   - Em `/etc/ssh/sshd_config`: `PasswordAuthentication no`, `PermitRootLogin no`, `PubkeyAuthentication yes`.
   - Preferencialmente restringir SSH à interface Tailscale.
2. **Firewall (`ufw` + Oracle Security List):**
   - Liberar publicamente apenas `80/tcp` e `443/tcp` (e `22/tcp` apenas para seu IP/Tailscale).
   - Nunca abrir `5432`, `6379`, `3000` ou `3001`.
3. **Atualizações automáticas e proteção contra brute-force:**
   - Instalar e ativar `unattended-upgrades` e `fail2ban`.
4. **Segredos em produção:**
   - Criar `.env` no diretório do app na VPS com `chmod 600 .env`, nunca versionado no Git.
