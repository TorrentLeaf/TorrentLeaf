# /migrate — Criar migration de banco

## Prompt
Crie uma migration para: $ARGUMENTS

1. Determine o próximo número sequencial (ls migrations/ no apps/api)
2. Crie o arquivo `NNN_<nome>.up.sql` e `NNN_<nome>.down.sql`
3. A migration up deve ser idempotente (IF NOT EXISTS, CREATE OR REPLACE)
4. A migration down deve desfazer completamente a up
5. Atualize o schema em `docs/architecture.md` se necessário
6. Execute `make migrate-up` para validar

Formato do arquivo: `migrations/NNN_snake_case_description.up.sql`
