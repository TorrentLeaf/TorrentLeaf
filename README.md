<div align="center">

# TorrentLeaf

**Read and watch torrents in your browser — streamed piece-by-piece from the BitTorrent swarm, no full download required.**

Paste a magnet link and start reading manga, books and documents — or watch video — while TorrentLeaf intelligently fetches only the pieces you need right now, plus a smart prefetch ahead of you.

[![Next.js](https://img.shields.io/badge/Next.js-16-000000?logo=next.js&logoColor=white)](https://nextjs.org/)
[![Go](https://img.shields.io/badge/Go-1.22+-00ADD8?logo=go&logoColor=white)](https://go.dev/)
[![Node.js](https://img.shields.io/badge/Node.js-20_LTS-339933?logo=node.js&logoColor=white)](https://nodejs.org/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-16-4169E1?logo=postgresql&logoColor=white)](https://www.postgresql.org/)
[![Docker](https://img.shields.io/badge/Docker_Compose-self--hostable-2496ED?logo=docker&logoColor=white)](https://docs.docker.com/compose/)
[![TypeScript](https://img.shields.io/badge/TypeScript-strict-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/)

</div>

<!--
  📸 SCREENSHOTS
  Drop your images into docs/screenshots/ using the exact filenames below.
  See docs/screenshots/README.md for the full list and recommended sizes.
-->


## Features

- **Magnet & `.torrent` ingestion** — paste a magnet URI (e.g. from Nyaa.si) and the swarm does the rest.
- **Smart streaming reader** — only the pieces you're about to read are prioritized, with background prefetch of the next pages.
- **Manga / comic reader** — paginated, webtoon and double-page modes, zoom, fit modes, reading direction, keyboard shortcuts.
- **Comic archive support** — reads `CBZ`/`ZIP` (random-access, no full download), `CBR`/`RAR` and `7z`.
- **PDF reader** — PDF.js with HTTP Range chunking for fast first paint.
- **EPUB reader** — epub.js with paginated and scrolled modes, CFI-based progress.
- **Video playback** — on-the-fly transmuxing to MP4/HLS, codec detection, multi-audio and subtitle track selection (WebVTT).
- **Auto-seeding** — seeds back to the swarm while you read, effortlessly.
- **Live transfer stats** — real-time progress, peers and download/upload speeds via WebSocket.
- **Library & reading progress** — per-user shelves with resume-where-you-left-off.
- **Authentication** — JWT access + refresh tokens, bcrypt, per-user settings.
- **Admin panel & metrics** — Prometheus metrics, Grafana + Loki dashboards.
- **Self-hostable** — one `docker compose up` away.

---

## Screenshots

### Library / Dashboard

![Library / Dashboard](docs/screenshots/Dashboard.png)

### Manga Reader

![Manga Reader](docs/screenshots/Reader-1.png)

![Manga Reader](docs/screenshots/Reader-2.png)

### Video Player

![Video Player](docs/screenshots/VideoPlayer.png)

### Add Torrent

![Add Torrent](docs/screenshots/AddTorrent.png)

### Settings

![Settings](docs/screenshots/Settings.png)

---

## Architecture

TorrentLeaf is a polyglot monorepo split across three runtimes, each chosen for its strengths: a Next.js front end, a Go API for business logic, and a Node.js engine wrapping WebTorrent.

```mermaid
flowchart TD
    subgraph Client
        WEB["apps/web<br/>Next.js 16 · TypeScript · Tailwind · shadcn/ui<br/>Reader UI · Library · Admin · Auth"]
    end

    subgraph Backend
        API["apps/api<br/>Go · Fiber · sqlc · pgx<br/>Auth · Sessions · Metadata · Library · Progress"]
        ENGINE["apps/torrent-engine<br/>Node.js · WebTorrent · Fastify<br/>Streaming · Peers · Transmux · Archives"]
    end

    subgraph Infra
        PG[("PostgreSQL 16")]
        REDIS[("Redis 7")]
        MINIO[("MinIO<br/>object storage")]
    end

    WEB -- "HTTP/REST + WebSocket" --> API
    API -- "HTTP (internal)" --> ENGINE
    API --> PG
    API --> REDIS
    ENGINE --> REDIS
    ENGINE -. "BitTorrent swarm" .-> SWARM(("Peers / DHT"))
    API --> MINIO

    CADDY["Caddy 2<br/>reverse proxy · TLS"] --> WEB
    CADDY --> API
```

### Services

| Container | Port | Role |
| --- | --- | --- |
| `web` | 3000 | Next.js front end |
| `api` | 8080 | Go backend |
| `torrent-engine` | 9000 | Node.js WebTorrent engine |
| `postgres` | 5432 | Primary database |
| `redis` | 6379 | Cache + job queue |
| `minio` | 9001 | Object storage (file cache) |
| `caddy` | 80/443 | Reverse proxy (automatic TLS) |

### How a read happens

```
magnet link ─▶ API creates session ─▶ engine joins swarm ─▶ metadata webhook
   ─▶ file list shown ─▶ user opens chapter ─▶ pieces prioritized
   ─▶ reader streams pages (HTTP Range) ─▶ prefetch +2..+5 ─▶ progress saved
```

---

## Tech Stack

**Frontend** — Next.js 16 (App Router), TypeScript (strict), Tailwind CSS, shadcn/ui + Radix, Zustand, TanStack Query, Framer Motion, PDF.js, epub.js, React Hook Form + Zod, next-intl (English-first).

**Backend (API)** — Go 1.22+, Fiber v2, sqlc + pgx/v5, golang-migrate, JWT + bcrypt, go-redis, zerolog, Prometheus, Swagger (swaggo), testify.

**Torrent engine** — Node.js 20, WebTorrent, Fastify v4, HTTP Range streaming, `yauzl` (CBZ/ZIP), `node-unrar-js` (CBR/RAR), `p7zip` (7z), `ffmpeg`/`ffprobe` (video transmux), Bull + Redis, Pino, Vitest.

**Infra** — PostgreSQL 16, Redis 7, MinIO, Caddy 2, Docker Compose, GitHub Actions, Prometheus + Grafana + Loki.

---

## Getting Started

### Prerequisites

- Docker & Docker Compose
- `make`

### Quick start

```bash
# 1. Clone
git clone <your-repo-url> torrentleaf && cd torrentleaf

# 2. First-time setup (deps, .env files, database)
make setup

# 3. Bring everything up in dev mode (hot reload)
make dev
```

Then open:

- **App** → http://localhost:3000
- **API** → http://localhost:8080
- **Grafana** → http://localhost:3001 _(if enabled)_

### Environment

Copy `.env.example` and adjust as needed. Key variables:

```bash
# apps/api/.env
DATABASE_URL=postgresql://torrentleaf:secret@postgres:5432/torrentleaf
REDIS_URL=redis://redis:6379
TORRENT_ENGINE_URL=http://torrent-engine:9000
JWT_SECRET=<32+ chars>
JWT_REFRESH_SECRET=<32+ chars>
API_WEBHOOK_SECRET=<shared with the engine>

# apps/torrent-engine/.env
TORRENT_DOWNLOAD_PATH=/data/torrents
MAX_TORRENTS=50
MAX_DISK_GB=20

# apps/web/.env.local
NEXT_PUBLIC_API_URL=http://localhost:8080
NEXT_PUBLIC_WS_URL=ws://localhost:8080
```

---

## Make Commands

| Command | Description |
| --- | --- |
| `make setup` | First-time setup (deps, `.env`, db) |
| `make dev` | Start everything in dev mode (hot reload) |
| `make build` | Production build of all services |
| `make test` | Run all tests |
| `make lint` | Lint all services |
| `make migrate-up` | Apply pending migrations |
| `make migrate-create` | Create a new migration |
| `make seed` | Seed the database with dev data |
| `make logs` | Tail logs from all services |
| `make clean` | Remove containers and volumes |

---

## API Overview

A selection of the REST surface (full reference in [`docs/api.md`](docs/api.md)):

```
POST   /api/v1/torrents              Add a magnet / .torrent
GET    /api/v1/torrents              List the user's torrents
GET    /api/v1/torrents/:id          Details + file list
POST   /api/v1/torrents/:id/priority Prioritize a file/chapter
GET    /api/v1/torrents/:id/ws       Live progress (WebSocket)

GET    /api/v1/reader/:id/pages      Page list for a file
GET    /api/v1/stream/:fileId        Stream a whole file (video → transmux)
GET    /api/v1/stream/:fileId/:page  Stream a single page (archive entry)
GET    /api/v1/probe/:fileId         Audio + subtitle streams (video)

POST   /api/v1/auth/{register,login,refresh,logout}
GET    /api/v1/library               User library
GET/PUT /api/v1/progress/:fileId     Reading progress
GET/PUT /api/v1/settings             User settings
GET    /metrics                      Prometheus metrics
GET    /health                       Health check
```

---

## Project Structure

```
torrentleaf/
├── apps/
│   ├── web/              Next.js front end
│   ├── api/             Go backend (Fiber + sqlc)
│   └── torrent-engine/   Node.js WebTorrent engine
├── packages/            Shared UI, types, config
├── infra/               Dockerfiles, Caddy, Grafana
├── docs/                Architecture, API, ADRs, screenshots
├── scripts/             setup / seed / dev helpers
└── docker-compose*.yml
```

---

## License

This project is provided for educational and personal self-hosting purposes. Respect the copyright laws of your jurisdiction — TorrentLeaf is a transport/reader and does not host or distribute any content.

---

<div align="center">
<sub>Built with Next.js · Go · WebTorrent — self-hostable via Docker Compose.</sub>
</div>
