# Backup diário criptografado e restauração

## 1. Gerar par de chaves `age` (na sua máquina, nunca na VPS)

```bash
age-keygen -o margem-backup.key
# Guarde margem-backup.key em cofre seguro (1Password/Bitwarden).
# Copie a linha "public key: age1..." para BACKUP_AGE_RECIPIENT no .env da VPS.
```
