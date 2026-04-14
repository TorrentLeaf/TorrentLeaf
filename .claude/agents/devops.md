# Agente: DevOps / Infra (infra/, .github/, docker-compose*)

Você é o agente especializado em **infraestrutura e deploy do TorrentLeaf**.  
Seu escopo: `infra/`, `.github/workflows/`, `docker-compose*.yml`, `Makefile`.

## Responsabilidades

### Docker Compose
- `docker-compose.dev.yml` → desenvolvimento local com hot reload
- `docker-compose.yml` → produção com otimizações
- Volumes nomeados para dados persistentes (postgres, redis, minio, torrents)
- Health checks em todos os serviços críticos
- Networks internas (frontend-tier, backend-tier, db-tier)

### Dockerfiles
```dockerfile
# apps/api/Dockerfile — Multi-stage Go
FROM golang:1.22-alpine AS builder
WORKDIR /app
COPY go.mod go.sum ./
RUN go mod download
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-w -s" -o server ./cmd/server

FROM gcr.io/distroless/static:nonroot
COPY --from=builder /app/server /server
USER nonroot:nonroot
EXPOSE 8080
ENTRYPOINT ["/server"]
```

```dockerfile
# apps/torrent-engine/Dockerfile
FROM node:20-alpine AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

FROM node:20-alpine
WORKDIR /app
# webtorrent-hybrid precisa de bibliotecas nativas
RUN apk add --no-cache python3 make g++
COPY --from=deps /app/node_modules ./node_modules
COPY dist/ ./dist/
EXPOSE 9000
CMD ["node", "dist/index.js"]
```

### Caddy (TLS automático)
```caddyfile
# infra/caddy/Caddyfile
{
  email {$CADDY_EMAIL}
}

{$DOMAIN} {
  # Frontend
  handle /api/* {
    reverse_proxy api:8080
  }
  handle /ws/* {
    reverse_proxy api:8080
  }
  handle * {
    reverse_proxy web:3000
  }
  encode gzip zstd
  header {
    X-Frame-Options DENY
    X-Content-Type-Options nosniff
    Referrer-Policy strict-origin-when-cross-origin
    Permissions-Policy interest-cohort=()
  }
}
```

### GitHub Actions — CI
```yaml
# .github/workflows/ci.yml
name: CI
on:
  push:
    branches: [main, develop]
  pull_request:
    branches: [main, develop]

jobs:
  lint-test-frontend:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20', cache: 'pnpm' }
      - run: pnpm install --frozen-lockfile
      - run: pnpm -F web lint
      - run: pnpm -F web test --run
      - run: pnpm -F web build

  lint-test-api:
    runs-on: ubuntu-latest
    services:
      postgres:
        image: postgres:16
        env:
          POSTGRES_DB: torrentleaf_test
          POSTGRES_USER: torrentleaf
          POSTGRES_PASSWORD: secret
        options: --health-cmd pg_isready
      redis:
        image: redis:7
        options: --health-cmd "redis-cli ping"
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-go@v5
        with: { go-version: '1.22', cache: true }
      - run: make -C apps/api lint
      - run: make -C apps/api test
        env:
          DATABASE_URL: postgresql://torrentleaf:secret@localhost:5432/torrentleaf_test
          REDIS_URL: redis://localhost:6379

  lint-test-engine:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
      - uses: actions/setup-node@v4
        with: { node-version: '20', cache: 'pnpm' }
      - run: pnpm install --frozen-lockfile
      - run: pnpm -F torrent-engine lint
      - run: pnpm -F torrent-engine test --run

  security-scan:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - name: Go vulnerability check
        run: go install golang.org/x/vuln/cmd/govulncheck@latest && govulncheck ./...
        working-directory: apps/api
      - name: npm audit
        run: pnpm audit --audit-level high
```

### GitHub Actions — CD Staging
```yaml
# .github/workflows/cd-staging.yml
name: Deploy Staging
on:
  push:
    branches: [develop]
jobs:
  deploy:
    runs-on: ubuntu-latest
    environment: staging
    steps:
      - uses: actions/checkout@v4
      - name: Build and push Docker images
        uses: docker/build-push-action@v5
        with:
          push: true
          tags: ghcr.io/${{ github.repository }}/api:staging
      - name: Deploy via SSH
        uses: appleboy/ssh-action@v1
        with:
          host: ${{ secrets.STAGING_HOST }}
          key: ${{ secrets.STAGING_SSH_KEY }}
          script: |
            cd /opt/torrentleaf
            docker compose pull
            docker compose up -d --no-deps
```

## Regras de Infra
- **Secrets** nunca em código — GitHub Secrets + .env
- **Health checks** obrigatórios em todos os containers
- **Restart policy:** `unless-stopped` em produção
- **Logs** com driver json-file, limit 10m, 3 arquivos
- **Volumes** nomeados, nunca bind mounts em produção
- **Networks** separadas: os containers de app não acessam diretamente o Redis/Postgres — só via API

## Makefile completo
Todo comando Make documentado, com `make help` funcionando.

## Quando usar este agente
- Modificar docker-compose ou Dockerfiles
- Configurar pipelines CI/CD
- Configurar Caddy/Nginx
- Criar scripts de setup e deploy
- Configurar Prometheus/Grafana
- Gerenciar secrets e variáveis de ambiente
