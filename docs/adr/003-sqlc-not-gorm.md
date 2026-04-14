# ADR 003 — Acesso ao banco em Go: sqlc + pgx, não GORM

**Status:** Aceito  
**Data:** 2025-04  
**Autores:** TorrentLeaf Core

---

## Contexto

O backend Go precisa de uma estratégia para interagir com o PostgreSQL.
As opções consideradas foram GORM, Ent, sqlx e sqlc + pgx.

---

## Decisão

**sqlc com pgx/v5 como driver.**

---

## Razões

**SQL explícito é documentação:** No TorrentLeaf as queries são críticas —
busca por embedding, joins entre sessões/arquivos/progresso, updates de status.
Com sqlc você escreve SQL real em arquivos `.sql`, e o compilador gera código
Go tipado automaticamente. Qualquer dev lê a query e entende exatamente o que
acontece. Com GORM, a query real fica escondida atrás de métodos encadeados e
às vezes gera SQL inesperado (N+1, queries sem índice).

**Performance sem surpresas:** GORM tem overhead de reflection em runtime.
pgx/v5 é o driver mais performático para PostgreSQL em Go — conexão pooled,
suporte nativo a tipos PostgreSQL (UUID, JSONB, vector), prepared statements
automáticos. Para um servidor de streaming que faz muitas queries pequenas por
segundo, esse overhead importa.

**pgvector nativo:** pgx suporta tipos customizados facilmente. Registrar o
tipo `vector` do pgvector é trivial com pgx. Com GORM, exigiria um plugin
externo e mais configuração.

**Compile-time safety:** sqlc valida as queries contra o schema em tempo de
compilação. Se você renomear uma coluna no migration sem atualizar a query,
o build quebra. Com GORM você só descobre em runtime.

**Por que não sqlx:** sqlx é bom mas requer escrever os tipos de scan
manualmente. sqlc gera isso automaticamente, reduzindo boilerplate sem
abrir mão do SQL explícito.

**Custo:** As queries precisam ser escritas manualmente em SQL. Para operações
simples como `INSERT` e `SELECT` por ID isso é mais verboso que GORM.
O trade-off vale para um projeto com queries complexas envolvendo pgvector,
múltiplos joins e updates condicionais.

---

## Consequências

- Toda query nova requer: escrever SQL em `sqlc/queries/`, rodar `make sqlc`,
  e usar o código gerado no repository.
- O CI deve rodar `sqlc generate --dry-run` para validar queries contra o schema.
- Mudanças de schema (migrations) devem ser acompanhadas de atualização das queries.
- Ganho: queries auditáveis, performance previsível, erros em compile time.

---

## Revisão

Sem previsão de revisão. sqlc + pgx é escolha estável para projetos Go com
PostgreSQL. Reavaliar apenas se surgir necessidade de multi-banco (improvável).
