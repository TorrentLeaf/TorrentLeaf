# TorrentLeaf — CLAUDE.md

> **Guia mestre para o Claude Code.** Leia este arquivo completamente antes de qualquer ação.
> TorrentLeaf é uma plataforma de leitura por streaming de torrents: mangás, PDFs e EPUBs diretamente do swarm BitTorrent, sem download completo pelo usuário final.

---

## 1. VISÃO DO PRODUTO

**TorrentLeaf** permite que o usuário cole um magnet link ou URL de `.torrent` (ex: Nyaa.si) e leia o conteúdo — mangá, livro, documento — página a página enquanto o sistema baixa inteligentemente apenas os pedaços necessários.

**Valores centrais:**
- Streaming inteligente: só baixar o que o usuário vai ler agora + prefetch
- UX de leitura premium: dark mode, reader fluido, zoom, modo webtoon/paginated
- Popularizar torrents: seed automático enquanto lê, sem esforço do usuário
- Self-hostável via Docker Compose

---

## 2. ARQUITETURA

```
┌─────────────────────────────────────────────────────────────┐
│  apps/web (Next.js 16 + TypeScript + Tailwind + shadcn/ui)  │
│  Reader UI · Catálogo · Admin · Auth · Biblioteca           │
└──────────────────────┬──────────────────────────────────────┘
                       │ HTTP/REST + WebSocket
┌──────────────────────▼──────────────────────────────────────┐
│  apps/api (Go + Fiber)                                       │
│  Auth · Sessões · Metadados · Biblioteca · Progresso · Fila │
└──────────┬────────────────────────────┬─────────────────────┘
           │ HTTP interno               │ PostgreSQL + Redis
┌──────────▼──────────┐    ┌───────────▼──────────────────────┐
│  apps/torrent-engine │    │  infra/                          │
│  Node.js + WT-hybrid │    │  PostgreSQL · Redis · MinIO      │
│  Streaming · Peers   │    │  Caddy (reverse proxy)           │
└─────────────────────┘    └──────────────────────────────────┘
```

### Serviços Docker
| Container | Porta | Função |
|-----------|-------|--------|
| `web` | 3000 | Frontend Next.js |
| `api` | 8080 | Backend Go |
| `torrent-engine` | 9000 | Node.js WebTorrent |
| `postgres` | 5432 | Banco principal |
| `redis` | 6379 | Cache + fila |
| `minio` | 9001 | Object storage (cache de arquivos) |
| `caddy` | 80/443 | Reverse proxy |

---

## 3. STACK COMPLETA

### Frontend (`apps/web`)
- **Framework:** Next.js 16 App Router + TypeScript strict
- **Estilo:** Tailwind CSS + shadcn/ui + Radix UI
- **Estado:** Zustand (global) + TanStack Query (server state)
- **Animações:** Framer Motion (microinterações somente)
- **Readers:** PDF.js, epub.js, reader custom de imagens (mangá)
- **Tipografia:** Geist (padrão Next.js), Inter como fallback
- **Ícones:** Lucide React
- **Forms:** React Hook Form + Zod
- **i18n:** next-intl — **EN primeiro** (UI default em inglês), PT-BR e outros idiomas depois via dicionários. Ver seção 6.1.

### Backend (`apps/api`)
- **Linguagem:** Go 1.22+
- **Framework:** Fiber v2
- **ORM/DB:** sqlc + pgx/v5 (sem ORM pesado)
- **Migrations:** golang-migrate
- **Auth:** JWT (access + refresh) + bcrypt
- **Cache:** go-redis v9
- **Config:** godotenv + viper
- **Logs:** zerolog
- **Metrics:** Prometheus client
- **Tests:** testify + httptest + mockery
- **Docs API:** Swagger via swaggo

### Torrent Engine (`apps/torrent-engine`)
- **Runtime:** Node.js 20 LTS
- **Engine:** `webtorrent` (BitTorrent puro — versão `-hybrid` foi descartada;
  ver ADR 002)
- **Framework:** Fastify v4
- **Streaming:** HTTP Range Requests sobre os pedaços do torrent
- **Arquivos comprimidos:**
  - CBZ/ZIP via `yauzl` (random-access sobre WTFile, lê só o que precisa)
  - CBR/RAR via `node-unrar-js` (requer arquivo completo em disco)
  - 7z via `/usr/bin/7z` do `p7zip-full` (requer arquivo completo em disco)
- **Vídeo:** `ffmpeg` + `ffprobe` para transmuxing on-the-fly. ffprobe detecta
  codec/pix_fmt; H.264 8-bit é copiado (`-c:v copy`), HEVC/VP9/10-bit
  re-codificam para H.264 baseline com `libx264 -preset ultrafast`. Áudio
  sempre re-codificado para AAC stereo. Legendas extraídas como WebVTT.
- **Filas:** Bull + Redis
- **Logs:** Pino
- **Tests:** Vitest + Supertest

### Infra
- **DB:** PostgreSQL 16
- **Cache:** Redis 7
- **Storage:** MinIO (S3-compatible)
- **Proxy:** Caddy 2 (TLS automático)
- **CI/CD:** GitHub Actions
- **Containerização:** Docker Compose (dev/prod)
- **Monitoramento:** Prometheus + Grafana + Loki

---

## 4. ESTRUTURA DE PASTAS

```
torrentleaf/
├── CLAUDE.md                          ← VOCÊ ESTÁ AQUI
├── .claude/
│   ├── settings.json                  ← Configurações Claude Code
│   ├── agents/                        ← Sub-agentes especializados
│   │   ├── frontend.md
│   │   ├── backend.md
│   │   ├── torrent-engine.md
│   │   ├── devops.md
│   │   └── testing.md
│   ├── commands/                      ← Slash commands customizados
│   │   ├── feature.md
│   │   ├── fix.md
│   │   ├── test.md
│   │   ├── migrate.md
│   │   └── deploy.md
│   ├── hooks/                         ← Hooks de automação
│   │   ├── pre-tool-use.sh
│   │   ├── post-tool-use.sh
│   │   └── stop.sh
│   └── skills/                        ← Skills do projeto
│       ├── reader-components.md
│       ├── torrent-streaming.md
│       ├── go-patterns.md
│       └── design-system.md
├── apps/
│   ├── web/                           ← Next.js Frontend
│   ├── api/                           ← Go Backend
│   └── torrent-engine/                ← Node.js WebTorrent
├── packages/
│   ├── ui/                            ← Componentes compartilhados
│   ├── types/                         ← Tipos TypeScript compartilhados
│   └── config/                        ← ESLint, Prettier, TSConfig base
├── infra/
│   ├── docker/                        ← Dockerfiles por serviço
│   ├── caddy/                         ← Caddyfile
│   └── grafana/                       ← Dashboards
├── docs/
│   ├── architecture.md
│   ├── api.md
│   ├── deployment.md
│   └── adr/                           ← Architectural Decision Records
├── .github/
│   └── workflows/
│       ├── ci.yml
│       ├── cd-staging.yml
│       ├── cd-production.yml
│       └── security.yml
├── scripts/
│   ├── setup.sh
│   ├── seed.sh
│   └── dev.sh
├── docker-compose.yml
├── docker-compose.dev.yml
├── docker-compose.prod.yml
├── Makefile
└── .env.example
```

---

## 5. CONVENÇÕES DE CÓDIGO

### TypeScript / Next.js
```typescript
// ✅ CORRETO: componentes com named export + tipos explícitos
export type ReaderProps = {
  torrentId: string
  fileIndex: number
  initialPage?: number
}
export function MangaReader({ torrentId, fileIndex, initialPage = 0 }: ReaderProps) {}

// ✅ Server Components por padrão; 'use client' só quando necessário
// ✅ Fetching com TanStack Query no client, fetch nativo em Server Components
// ✅ Zod para validação de forms e API responses
// ✅ Paths absolutos via tsconfig: @/components, @/lib, etc.
// ❌ NUNCA usar any implícito
// ❌ NUNCA misturar lógica de negócio em componentes de UI
```

### Go
```go
// ✅ CORRETO: handler limpo delegando para service
func (h *TorrentHandler) AddTorrent(c *fiber.Ctx) error {
    var req dto.AddTorrentRequest
    if err := c.BodyParser(&req); err != nil {
        return fiber.NewError(fiber.StatusBadRequest, "invalid body")
    }
    if err := h.validator.Struct(req); err != nil {
        return fiber.NewError(fiber.StatusUnprocessableEntity, err.Error())
    }
    session, err := h.torrentService.Add(c.Context(), req)
    if err != nil {
        return err
    }
    return c.Status(fiber.StatusCreated).JSON(session)
}

// ✅ Errors sempre wrapeados com fmt.Errorf("contexto: %w", err)
// ✅ Context propagado por toda a cadeia
// ✅ Interfaces definidas onde são usadas (consumidor, não produtor)
// ✅ sqlc para queries SQL (sem ORM)
// ❌ NUNCA panic em handlers HTTP
// ❌ NUNCA expor erros internos no response JSON
```

### Node.js / Torrent Engine
```typescript
// ✅ CORRETO: streaming com backpressure
async function streamFileChunk(torrentId: string, fileIndex: number, range: Range) {
  const file = await engineService.getFile(torrentId, fileIndex)
  const stream = file.createReadStream({ start: range.start, end: range.end })
  return stream
}

// ✅ Bull queues para jobs assíncronos
// ✅ Fastify schemas para validação de routes
// ✅ Pino para logs estruturados
// ❌ NUNCA bloquear o event loop com operações síncronas pesadas
```

---

## 6. DESIGN SYSTEM

### Paleta de Cores (CSS Variables)
```css
/* Dark mode primeiro — padrão do TorrentLeaf */
--background: 222 47% 5%        /* quase preto, azul-cinza */
--surface: 222 35% 9%           /* cards, painéis */
--surface-2: 222 30% 13%        /* hover states, inputs */
--border: 222 25% 18%           /* bordas sutis */
--accent: 158 64% 52%           /* verde-esmeralda — cor principal */
--accent-hover: 158 64% 45%     /* hover do accent */
--muted: 222 15% 40%            /* texto secundário */
--foreground: 210 20% 92%       /* texto principal */
--destructive: 0 72% 51%        /* erros */
--warning: 38 92% 50%           /* avisos */
```

### Tipografia
- **Display/Heading:** Geist (weight 700/800)
- **Body:** Geist (weight 400/500)
- **Mono/Code:** Geist Mono
- **Escala:** 12/14/16/18/20/24/30/36/48px

### Componentes Chave
- `<TorrentCard>` — card de torrent com thumbnail, progresso, badges
- `<MangaReader>` — reader full-screen com preload inteligente
- `<PdfReader>` — PDF.js wrapper com range requests
- `<EpubReader>` — epub.js wrapper
- `<LibraryGrid>` — grade responsiva da biblioteca
- `<TorrentProgress>` — barra de progresso em tempo real
- `<PageTurnAnimation>` — animação de virar página (opcional)

### Regras Visuais
- Dark mode é o PADRÃO; light theme suportado via next-themes (toggle na sidebar).
  Superfícies imersivas (readers, video player) permanecem escuras por design.
- Radius: `--radius: 0.75rem` para cards, `0.5rem` para inputs, `0.375rem` para badges
- Sombras sutis: `shadow-sm` é o máximo para elementos flat
- Transições: `transition-all duration-200` padrão, `duration-300` para modais
- Sem gradientes forçados; sem neon excessivo; visual técnico e limpo
- Grid: 12 colunas, gaps de 4/6/8 unidades Tailwind

### 6.1 Idioma da Interface (regra obrigatória)

**Toda a UI do `apps/web` é escrita em INGLÊS por padrão.** O projeto nasce
English-first e adiciona outros idiomas depois via `next-intl`. Isso vale para:

- Labels, placeholders, botões, títulos de páginas, mensagens de erro/toast
- Textos em Server Components e Client Components
- Copy de vazios (empty states), tooltips, `aria-label`, `alt` de imagens
- Validações do Zod exibidas ao usuário (`.min(3, 'minimum 3 characters')`)
- Nomes de rotas visíveis (`/library`, `/add`, `/settings` — nunca `/biblioteca`)

**NUNCA** hardcode strings em português/espanhol/etc. diretamente em componentes.
Enquanto o `next-intl` não está ativado, escreva em inglês direto no JSX — o
refactor para dicionários `messages/en.json`, `messages/pt-BR.json` virá depois.

O que **NÃO** precisa estar em inglês:
- Comentários de código, commits internos de discussão de decisão de produto,
  ADRs em `docs/adr/` (podem ser em PT-BR enquanto o time for lusófono)
- `CLAUDE.md`, `AGENTS.md`, agentes/skills — documentação interna do projeto

Exemplo:
```tsx
// ❌ ERRADO
<Button>Criar conta</Button>
<p>Sua biblioteca está vazia</p>

// ✅ CORRETO
<Button>Create account</Button>
<p>Your library is empty</p>
```

Ao adicionar `next-intl` no futuro, o locale default será `en` e `pt-BR` será
o segundo idioma suportado (ver ADR a ser criado quando a migração acontecer).

---

## 7. DOMÍNIO E ENTIDADES

### Entidades principais
```typescript
// Torrent Session
type TorrentSession = {
  id: string               // UUID
  infoHash: string
  magnetURI: string
  name: string
  status: 'fetching_metadata' | 'downloading' | 'seeding' | 'paused' | 'error'
  files: TorrentFile[]
  peers: number
  downloadSpeed: number    // bytes/s
  uploadSpeed: number
  progress: number         // 0-1
  addedAt: Date
}

// Torrent File
type TorrentFile = {
  id: string
  sessionId: string
  index: number
  name: string
  path: string
  length: number
  mimeType: string  // image/*, video/*, application/pdf, application/epub+zip, etc.
  // Persisted file types. Note: '.zip' is normalized to 'cbz' and '.7z'/'.rar'
  // are normalized to 'cbr' at the API layer (the engine route picks the right
  // extractor by actual extension). 'video' was added in migration 005.
  type: 'image' | 'pdf' | 'epub' | 'cbz' | 'cbr' | 'video' | 'unknown'
  downloadedBytes: number
  priority: 0 | 1 | 2     // 0=skip, 1=normal, 2=high
}

// Reading Session
type ReadingSession = {
  id: string
  userId: string
  torrentSessionId: string
  fileId: string
  currentPage: number
  totalPages: number
  lastReadAt: Date
  readingMode: 'paginated' | 'webtoon' | 'double-page'
}

// Library Item
type LibraryItem = {
  id: string
  userId: string
  torrentSessionId: string
  title: string
  coverUrl?: string
  type: 'manga' | 'book' | 'document' | 'video' | 'other'
  addedAt: Date
  lastReadAt?: Date
  progress?: number
}
```

### Rotas da API Go
```
POST   /api/v1/torrents              → Adicionar magnet/torrent
POST   /api/v1/torrents/file         → Adicionar via upload de .torrent (multipart, campo "torrent")
GET    /api/v1/torrents              → Listar torrents do usuário
GET    /api/v1/torrents/:id          → Detalhes + lista de arquivos
DELETE /api/v1/torrents/:id          → Remover torrent
POST   /api/v1/torrents/:id/priority → Priorizar arquivo/capítulo
GET    /api/v1/torrents/:id/ws       → WebSocket de progresso

GET    /api/v1/reader/:id/pages      → Lista de páginas de um arquivo
GET    /api/v1/stream/:fileId        → Stream do arquivo inteiro (vídeo → transmux)
GET    /api/v1/stream/:fileId/:page  → Stream de página individual (CBZ/CBR/7z entry)
GET    /api/v1/probe/:fileId         → Streams de áudio + legendas (vídeos)
GET    /api/v1/subtitles/:fileId/:streamIndex → WebVTT de uma faixa de legenda

POST   /api/v1/auth/register
POST   /api/v1/auth/login
POST   /api/v1/auth/refresh
POST   /api/v1/auth/logout

GET    /api/v1/library               → Biblioteca do usuário
POST   /api/v1/library               → Adicionar à biblioteca
DELETE /api/v1/library/:id

GET    /api/v1/progress/:fileId      → Progresso de leitura
PUT    /api/v1/progress/:fileId      → Atualizar progresso

GET    /api/v1/settings              → Settings do usuário
PUT    /api/v1/settings              → Atualizar settings

GET    /api/v1/admin/torrents        → Admin: todos os torrents
POST   /api/v1/admin/torrents/:id/pause   → Admin: pausar
POST   /api/v1/admin/torrents/:id/resume  → Admin: retomar
DELETE /api/v1/admin/torrents/:id    → Admin: deletar
GET    /metrics                      → Prometheus metrics
GET    /health                       → Health check
```

**Auth nas rotas de stream/probe/subtitles:** usam `RequireAuthWS` (token
via `?token=` na query) porque `<video>`, `<img>` e `<track>` não conseguem
setar headers customizados.

### Rotas do Torrent Engine (interno)
```
POST   /engine/torrents              → Adicionar torrent (aceita downloadPath)
POST   /engine/torrents/file         → Adicionar via upload de .torrent (multipart, campo "torrent")
DELETE /engine/torrents/:infoHash    → Remover
GET    /engine/torrents              → Listar todos os torrents ativos
GET    /engine/torrents/:infoHash    → Status + files
POST   /engine/torrents/:infoHash/priority → Priorizar arquivo

GET    /engine/stream/:infoHash/:fileIndex          → Stream HTTP (Range), lê de disco
GET    /engine/archive/:hash/:idx/entries           → Lista entries de CBZ/CBR/7z
GET    /engine/archive/:hash/:idx/entry/:entryIdx   → Stream de uma entry (imagem)
GET    /engine/transmux/:hash/:idx                  → MP4 fragmentado on-the-fly
                                                       Query: ?audio=<absoluteIdx>
GET    /engine/probe/:hash/:idx                     → Audio + subtitle streams (JSON)
GET    /engine/subtitles/:hash/:idx/:streamIdx      → Stream WebVTT

GET    /engine/health
```

Streaming, archive, transmux, probe e subtitles **leem do disco** (não do
swarm). Quando o arquivo ainda não está completamente baixado, o engine
retorna HTTP 503 + `Retry-After: 5` para o frontend reusar até o disco
encher.

---

## 8. BANCO DE DADOS

### Esquema PostgreSQL
```sql
-- Usuários
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  username VARCHAR(50) UNIQUE NOT NULL,
  email VARCHAR(255) UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role VARCHAR(20) DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Sessões de torrent
CREATE TABLE torrent_sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  info_hash VARCHAR(40) UNIQUE NOT NULL,
  magnet_uri TEXT,
  name TEXT,
  status VARCHAR(30) DEFAULT 'fetching_metadata',
  total_size BIGINT,
  downloaded_bytes BIGINT DEFAULT 0,
  peers_count INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Arquivos do torrent
CREATE TABLE torrent_files (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  session_id UUID REFERENCES torrent_sessions(id) ON DELETE CASCADE,
  file_index INT NOT NULL,
  name TEXT NOT NULL,
  path TEXT NOT NULL,
  length BIGINT NOT NULL,
  mime_type VARCHAR(100),
  file_type VARCHAR(20),
  priority INT DEFAULT 1,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Progresso de leitura
CREATE TABLE reading_progress (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  file_id UUID REFERENCES torrent_files(id) ON DELETE CASCADE,
  current_page INT DEFAULT 0,
  total_pages INT,
  reading_mode VARCHAR(20) DEFAULT 'paginated',
  last_read_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, file_id)
);

-- Biblioteca
CREATE TABLE library_items (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  session_id UUID REFERENCES torrent_sessions(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  cover_url TEXT,
  content_type VARCHAR(20) DEFAULT 'other',
  added_at TIMESTAMPTZ DEFAULT NOW(),
  last_read_at TIMESTAMPTZ,
  UNIQUE(user_id, session_id)
);

-- Índices
CREATE INDEX idx_torrent_sessions_user ON torrent_sessions(user_id);
CREATE INDEX idx_torrent_files_session ON torrent_files(session_id);
CREATE INDEX idx_reading_progress_user ON reading_progress(user_id);
CREATE INDEX idx_library_user ON library_items(user_id);
```

### Migrations aplicadas (resumo das mudanças incrementais)

| # | O que mudou |
|---|------------|
| 001 | Schema inicial + extensão `vector` (pgvector) |
| 002 | `reading_progress.location TEXT` para CFI de EPUB |
| 003 | Tabela `refresh_tokens` (revogação de refresh JWT) |
| 004 | Tabela `user_settings` (download path, reader defaults, etc.) |
| 005 | `'video'` adicionado aos CHECK de `torrent_files.file_type` e `library_items.content_type` |
| 006 | `UNIQUE(info_hash)` em `torrent_sessions` virou `UNIQUE(user_id, info_hash)` — múltiplos usuários podem adicionar o mesmo torrent |

**Convenção:** `'sevenz'` (engine) e `'zip'` (engine) são **normalizados na
camada Go** para `'cbr'` e `'cbz'` respectivamente, mantendo o CHECK
existente. O engine usa a extensão real do arquivo para escolher o extractor.

---

## 9. FLUXO COMPLETO DE LEITURA

```
1. Usuário cola magnet link na UI
   ↓
2. Frontend → POST /api/v1/torrents { magnetURI }
   ↓
3. API Go cria TorrentSession no banco (status: fetching_metadata)
4. API Go → POST /engine/torrents { magnetURI }
   ↓
5. Engine Node.js adiciona no WebTorrent Hybrid
6. Engine aguarda metadata do swarm
7. Engine → callback/webhook → API Go com lista de arquivos
   ↓
8. API Go grava TorrentFiles no banco
9. API Go → WebSocket push para o frontend: "metadata pronta"
   ↓
10. Frontend mostra lista de arquivos (capítulos/PDF)
    ↓
11. Usuário clica em "Ler capítulo 1"
    ↓
12. Frontend → POST /api/v1/torrents/:id/priority { fileIndex: 0, priority: 2 }
13. API Go → POST /engine/torrents/:hash/priority
14. Engine prioriza as peças daquele arquivo no swarm
    ↓
15. Reader component → GET /api/v1/reader/:id/pages
16. API Go retorna lista de páginas com URLs de stream
    ↓
17. Reader carrega página via GET /api/v1/stream/:fileId/:page
18. API Go proxy → GET /engine/stream/:hash/:index com Range header
19. Engine entrega bytes do arquivo via stream
    ↓
20. Reader pré-carrega páginas +2 a +5 em background
21. Usuário lê; progresso salvo a cada página via PUT /api/v1/progress/:fileId
```

---

## 10. REGRAS PARA O CLAUDE CODE

### O que SEMPRE fazer
- Ler este CLAUDE.md antes de qualquer implementação
- Usar o agente correto para cada área (ver `.claude/agents/`)
- Criar testes para toda lógica de negócio nova
- Seguir as convenções de código desta seção 5
- Usar `make` targets definidos no Makefile
- Rodar `make lint` e `make test` antes de considerar uma tarefa completa
- Criar migrations numeradas para qualquer mudança de schema
- Documentar decisões arquiteturais em `docs/adr/`

### O que NUNCA fazer
- Não criar arquivos fora da estrutura definida na seção 4
- Não usar ORMs pesados (GORM, Prisma no backend Go) — use sqlc
- Não expor erros internos de infraestrutura no response da API
- Não usar `any` implícito em TypeScript
- Não fazer operações de banco diretamente em handlers — sempre passar por services
- Não guardar credenciais em código — sempre usar variáveis de ambiente
- Não misturar lógica do torrent engine no backend Go diretamente
- Não usar `console.log` em produção — usar logger estruturado (pino/zerolog)

### Ordem de prioridade de implementação
1. **Ingestão:** magnet → metadata → lista de arquivos
2. **Reader de imagens/mangá:** stream de páginas + prefetch
3. **Reader de PDF:** PDF.js + range requests
4. **Reader de EPUB:** epub.js
5. **Biblioteca e progresso de leitura**
6. **Auth (JWT)**
7. **Admin panel**
8. **Seeding automático + métricas**

---

## 11. VARIÁVEIS DE AMBIENTE

```bash
# apps/api/.env
DATABASE_URL=postgresql://torrentleaf:secret@postgres:5432/torrentleaf
REDIS_URL=redis://redis:6379
TORRENT_ENGINE_URL=http://torrent-engine:9000
JWT_SECRET=<32+ chars random>
JWT_REFRESH_SECRET=<32+ chars random>
JWT_ACCESS_TTL=2h          # default
JWT_REFRESH_TTL=168h       # default (7 dias)
API_WEBHOOK_SECRET=<shared com o engine para webhook de metadata>
CORS_ALLOWED_ORIGINS=https://app.example.com  # produção; dev usa localhost
MINIO_ENDPOINT=minio:9000
MINIO_ACCESS_KEY=torrentleaf
MINIO_SECRET_KEY=secret
PORT=8080
ENV=development
LOG_LEVEL=debug

# apps/torrent-engine/.env
REDIS_URL=redis://redis:6379
API_URL=http://api:8080
API_WEBHOOK_SECRET=<mesmo da api>
TORRENT_DOWNLOAD_PATH=/data/torrents
MAX_TORRENTS=50
MAX_DISK_GB=20
PORT=9000
NODE_ENV=development

# apps/web/.env.local
NEXT_PUBLIC_API_URL=http://localhost:8080
NEXT_PUBLIC_WS_URL=ws://localhost:8080
```

---

## 12. COMANDOS MAKE

```bash
make setup          # Primeira configuração (deps, .env, db)
make dev            # Sobe tudo em modo dev (hot reload)
make build          # Build de produção de todos os serviços
make test           # Roda todos os testes
make test-watch     # Testes em modo watch
make lint           # Lint em todos os serviços
make migrate-up     # Roda migrations pendentes
make migrate-down   # Reverte última migration
make migrate-create # Cria nova migration
make seed           # Seed do banco com dados de dev
make clean          # Remove containers e volumes
make logs           # Tail dos logs de todos os serviços
make ps             # Status dos containers
```

---

## 13. REFERÊNCIAS

- [WebTorrent](https://github.com/webtorrent/webtorrent)
- [webtorrent-hybrid](https://github.com/webtorrent/webtorrent-hybrid)
- [Fiber (Go)](https://github.com/gofiber/fiber)
- [sqlc](https://sqlc.dev/)
- [shadcn/ui](https://ui.shadcn.com/)
- [PDF.js](https://mozilla.github.io/pdf.js/)
- [epub.js](https://github.com/futurepress/epub.js/)
- [golang-migrate](https://github.com/golang-migrate/migrate)
- [TanStack Query](https://tanstack.com/query)
- [Zustand](https://github.com/pmndrs/zustand)

---

## 14. MELHORIAS DE PRODUÇÃO (já implementadas)

### pgvector — busca semântica no catálogo
O schema já inclui `CREATE EXTENSION vector` e coluna `name_embedding vector(768)`
em `torrent_sessions`. Para ativar busca semântica quando tiver dados:
```sql
-- Descomentar índice HNSW na migration 001 e rodar busca:
SELECT id, name, 1 - (name_embedding <=> $1::vector) AS similarity
FROM torrent_sessions ORDER BY name_embedding <=> $1::vector LIMIT 10;
```

### MCP Customizado (`tools/mcp-torrentleaf/`)
10 tools para usar durante desenvolvimento sem abrir a UI:
`health_check`, `add_torrent`, `list_torrents`, `get_torrent`,
`get_reader_pages`, `check_stream`, `get_reading_progress`,
`inspect_queue`, `get_metrics`, `simulate_reading_session`.

Setup: `cd tools/mcp-torrentleaf && npm install && npm run build`

### ADRs (`docs/adr/`)
- `001` Por que Go no backend | `002` Por que webtorrent-hybrid | `003` Por que sqlc
- `004` Leitura de CBZ | `005` EPUB reader via CFI | `006` Download path via bind-mount (subpath-only)
- Criar novo ADR para qualquer decisão arquitetural relevante

### AGENTS.md (raiz)
Ler antes de qualquer tarefa multi-serviço — define orquestração entre agentes.

### Reader Skill (`.claude/skills/reader-components.md`)
Ler obrigatoriamente antes de tocar em qualquer componente de reader.
Cobre: preload com IntersectionObserver, imagens de tamanho variável,
modos paginated/webtoon/double-page, keyboard shortcuts, PDF.js range requests.

### Vídeo: transmuxing e seleção de faixas
Toda a leitura de vídeo passa pelo `/engine/transmux` (ver
`apps/torrent-engine/src/api/routes/transmux.ts`). Pontos importantes:

- `ffprobe` detecta `codec_name` + `pix_fmt`. Só `h264 + yuv420p/yuvj420p`
  é copiado direto; o resto é re-codificado com `libx264 -preset ultrafast`.
- Áudio sempre re-codificado para AAC 192k stereo (handles EAC3, DTS, FLAC, etc.).
- Legendas texto (subrip/ass/ssa/mov_text/webvtt) são extraídas como WebVTT
  via `/engine/subtitles/...`. Legendas em imagem (PGS/VobSub) **não são
  suportadas** (precisariam OCR).
- Resposta usa `reply.hijack()` + pipe para `reply.raw` — `reply.send(stream)`
  do Fastify zerava o body por interação com o hook `onSend`.
- O ffmpeg lê **direto do disco** (não via stdin pipe) para que `-map` consiga
  endereçar streams pelo índice absoluto.

### Arquivos comprimidos: CBZ, CBR, 7z, ZIP
Ver `apps/torrent-engine/src/files/archive.ts`. CBZ/ZIP usam `yauzl` random-
access (leem só o central directory do swarm); CBR e 7z exigem o arquivo
inteiro em disco. A rota `/engine/archive` despacha pelo tipo:

- `.cbz` / `.zip` → `listCbzEntries` / `openCbzEntry` (yauzl)
- `.cbr` / `.rar` → `listCbrEntries` / `openCbrEntry` (node-unrar-js)
- `.7z` → `listSevenZEntries` / `openSevenZEntry` (shell out para `/usr/bin/7z`)

No Go, `normalizeFileType` mapeia `'zip'` → `FileTypeCBZ` e `'rar'`/`'7z'` →
`FileTypeCBR` para evitar nova migration. O engine usa a extensão real do
arquivo para escolher o extractor correto.

### Settings de usuário
`/api/v1/settings` (GET/PUT) — backend em `apps/api/internal/{domain,handler,
repository,service}/settings*.go`. Consumidos por:

- `TorrentService.Add` lê `downloadPath` e `autoAddLibrary` antes de adicionar
  ao engine / shelvar.
- `TorrentService.ReseedEngine` (startup) usa `downloadPath` por usuário.
- `MangaReader`, `EpubReader`, `PdfReader` inicializam `readerBackground`,
  `defaultReadingMode`, `defaultFitMode`, `readingDirection` a partir do hook
  `useUserSettings()`.

### Multi-usuário no mesmo torrent
Após migration 006, dois usuários podem adicionar o mesmo info_hash sem
conflito. `Add()` usa `GetByUserAndInfoHash` para idempotência por usuário e
cria uma nova `TorrentSession` por usuário apontando para o mesmo torrent no
engine.

### Reseed automático no startup
`TorrentService.ReseedEngine` (chamado em goroutine no `main.go`) re-adiciona
todos os torrents `downloading`/`seeding` ao engine quando a API sobe. Isso
recupera de restarts do engine (state em memória, perde tudo). Hidratar é
best-effort — peers velhos podem nunca voltar.

### Finalization (branch `finalization`) — features adicionadas
- **Erros de add transparentes:** engine lança `AddTorrentError{code}`
  (`insufficient_disk`/`disk_budget`/`max_torrents`/`invalid_magnet`/`invalid_path`);
  API mapeia para HTTP correto (disco cheio → 507, não mais 503 genérico) via
  `EngineAddError` + `mapEngineAddError`; a UI mostra a mensagem real no toast.
- **Upload de `.torrent`:** `POST /api/v1/torrents/file` (multipart) →
  `POST /engine/torrents/file`. Componente `<TorrentFileInput>` na página `/add`.
- **Download path por usuário:** bind-mount `TORRENTLEAF_DATA_DIR` (ver ADR 006);
  `resolveDownloadPath` (engine) e `validDownloadSubpath` (API) garantem subpasta
  segura (rejeitam `/` absoluto e `..`).
- **Magnet protocol handler:** `<RegisterMagnetHandler>` chama
  `navigator.registerProtocolHandler('magnet', '/add?magnet=%s')`; `/add` lê
  `?magnet=` e pré-preenche (sem auto-submit — consentimento explícito).
- **Sidebar Library = filtros de formato reais:** API deriva `format`
  (`comics|books|pdfs|video|other`) do file_type dominante da sessão
  (`formatFromFileType`); a sidebar mostra contagens ao vivo e filtra `/library`.
- **Light theme real:** `next-themes` (`ThemeProvider attribute="class"`,
  default `dark`); tokens CSS divididos em `:root` (light) + `.dark`. Toggle
  `<ThemeToggle>` na sidebar. Readers e video player permanecem escuros por design.
- **Removido:** toggle decorativo de Notifications da sidebar.
