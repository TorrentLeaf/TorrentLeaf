# TorrentLeaf — AGENTS.md

> Leia este arquivo **junto com o CLAUDE.md** antes de qualquer tarefa.
> Define como orquestrar os sub-agentes especializados e quando usar cada um.

---

## Regra principal de orquestração

Antes de começar qualquer implementação, identifique qual camada será tocada e
use **somente** o agente correspondente. Se uma feature tocar múltiplas camadas,
orquestre em sequência: **types → migration → backend → engine → frontend**.
Nunca misture responsabilidades entre agentes numa mesma sessão.

---

## Mapa de decisão

```
Qual arquivo/pasta está sendo criado ou editado?
│
├── apps/web/**              → Agente: FRONTEND
├── packages/ui/**           → Agente: FRONTEND
│
├── apps/api/**              → Agente: BACKEND
├── apps/api/migrations/**   → Agente: BACKEND  (via /migrate command)
│
├── apps/torrent-engine/**   → Agente: TORRENT-ENGINE
│
├── infra/**                 → Agente: DEVOPS
├── .github/workflows/**     → Agente: DEVOPS
├── docker-compose*.yml      → Agente: DEVOPS
├── Makefile                 → Agente: DEVOPS
│
├── **/*.test.*              → Agente: TESTING
├── **/*.spec.*              → Agente: TESTING
├── tests/e2e/**             → Agente: TESTING
│
└── tools/mcp-torrentleaf/** → Agente: BACKEND  (TypeScript, mesmo padrão)
```

---

## Quando usar cada agente

### FRONTEND `.claude/agents/frontend.md`
- Criar ou editar qualquer componente React/Next.js
- Implementar lógica de reader (MangaReader, PdfReader, EpubReader)
- Configurar Tailwind, shadcn/ui, tokens de design
- Stores Zustand, queries TanStack Query
- Páginas do App Router

**Skill obrigatória antes de mexer no reader:**
→ Leia `.claude/skills/reader-components.md` + `.claude/skills/torrent-streaming.md`

---

### BACKEND `.claude/agents/backend.md`
- Criar handlers, services, repositories em Go
- Escrever ou rodar migrations SQL
- Configurar rotas Fiber, middlewares, auth JWT
- Workers de background, engine client HTTP
- Qualquer mudança no schema do banco

**Skill obrigatória:**
→ Leia `.claude/skills/go-patterns.md`

**Ordem de implementação obrigatória para features novas:**
```
domain types → interface → migration → sqlc query → repository → service → handler → testes
```

---

### TORRENT-ENGINE `.claude/agents/torrent-engine.md`
- Qualquer mudança em `apps/torrent-engine/`
- Lógica de priorização de peças, streaming, extração de CBZ/CBR
- Jobs Bull, comunicação com backend via webhook/Redis

**Skill obrigatória:**
→ Leia `.claude/skills/torrent-streaming.md`

---

### DEVOPS `.claude/agents/devops.md`
- Modificar Dockerfiles, docker-compose, Caddyfile
- Pipelines GitHub Actions
- Configuração de Prometheus/Grafana
- Scripts de deploy e setup

---

### TESTING `.claude/agents/testing.md`
- Escrever testes unitários para qualquer serviço
- Testes de integração com banco/redis reais
- Testes E2E com Playwright
- Aumentar coverage

---

## Fluxo de feature completa (multi-agente)

Exemplo: **"Adicionar sistema de favoritos"**

```
1. BACKEND   → /migrate criar tabela favorites
2. BACKEND   → sqlc query + repository + service + handler
3. FRONTEND  → hook useFavorites + botão no TorrentCard + página /library
4. TESTING   → testes do service (Go) + testes do componente (Vitest)
5. DEVOPS    → verificar se precisa de nova env var ou config
```

Cada etapa é uma sessão separada com o agente correto.
Nunca tente fazer tudo em uma sessão só.

---

## Regras globais (valem para TODOS os agentes)

1. **Sempre ler o CLAUDE.md primeiro** — especialmente seção 5 (convenções) e seção 7 (domínio)
2. **Nunca criar arquivos fora da estrutura** definida na seção 4 do CLAUDE.md
3. **Nunca expor erros internos** na API — mapear para erros HTTP limpos
4. **Sempre rodar `make lint && make test`** antes de considerar uma tarefa concluída
5. **Criar ADR** em `docs/adr/` para qualquer decisão arquitetural relevante
6. **pgvector já está no schema** — usar para busca semântica quando aplicável

---

## MCP Servers disponíveis (`.mcp.json`)

| Server | Quando usar |
|--------|-------------|
| `postgres` | Inspecionar schema, debugar queries, validar migrations |
| `redis` | Inspecionar filas Bull, cache, pub/sub de progresso |
| `github` | Criar issues, PRs, verificar CI status |
| `docker` | Ver logs, status de containers, restart de serviços |
| `filesystem` | Leitura de arquivos gerados, logs locais |
| `torrentleaf` | Testar endpoints da própria API durante desenvolvimento |

---

## Slash commands disponíveis

| Comando | Uso |
|---------|-----|
| `/feature <descrição>` | Implementar feature completa |
| `/test <arquivo ou módulo>` | Escrever testes para código existente |
| `/migrate <descrição>` | Criar nova migration SQL |
