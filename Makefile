# TorrentLeaf — Makefile
# Uso: make <target>
# Ex:  make dev | make test | make migrate-up

SHELL := /bin/bash
.DEFAULT_GOAL := help

# ─── Variáveis ────────────────────────────────────────────────────────────────
API_DIR        := apps/api
WEB_DIR        := apps/web
ENGINE_DIR     := apps/torrent-engine
MIGRATION_DIR  := $(API_DIR)/migrations
COMPOSE        := docker compose -f docker-compose.dev.yml
DB_URL         ?= postgresql://torrentleaf:secret@localhost:5432/torrentleaf?sslmode=disable
MIGRATION_NAME ?= new_migration

# Cores
CYAN  := \033[0;36m
GREEN := \033[0;32m
YELLOW := \033[1;33m
RESET := \033[0m

# ─── Help ─────────────────────────────────────────────────────────────────────
.PHONY: help
help: ## Mostra este menu de ajuda
	@echo ""
	@echo "  $(CYAN)TorrentLeaf$(RESET) — Comandos disponíveis:"
	@echo ""
	@awk 'BEGIN {FS = ":.*##"} /^[a-zA-Z_-]+:.*##/ {printf "  $(GREEN)%-20s$(RESET) %s\n", $$1, $$2}' $(MAKEFILE_LIST)
	@echo ""

# ─── Setup ────────────────────────────────────────────────────────────────────
.PHONY: setup
setup: ## Primeira configuração completa do projeto
	@echo "$(CYAN)→ Configurando TorrentLeaf...$(RESET)"
	@cp -n .env.example .env 2>/dev/null || true
	@cp -n $(API_DIR)/.env.example $(API_DIR)/.env 2>/dev/null || true
	@cp -n $(ENGINE_DIR)/.env.example $(ENGINE_DIR)/.env 2>/dev/null || true
	@cp -n $(WEB_DIR)/.env.example $(WEB_DIR)/.env.local 2>/dev/null || true
	@echo "$(CYAN)→ Instalando dependências Node...$(RESET)"
	@pnpm install
	@echo "$(CYAN)→ Baixando módulos Go...$(RESET)"
	@cd $(API_DIR) && go mod download
	@echo "$(CYAN)→ Instalando ferramentas Go...$(RESET)"
	@go install github.com/golangci/golangci-lint/cmd/golangci-lint@latest
	@go install github.com/golang-migrate/migrate/v4/cmd/migrate@latest
	@go install github.com/sqlc-dev/sqlc/cmd/sqlc@latest
	@go install github.com/vektra/mockery/v2@latest
	@echo "$(GREEN)✓ Setup concluído! Rode 'make dev' para iniciar.$(RESET)"

# ─── Desenvolvimento ──────────────────────────────────────────────────────────
.PHONY: dev
dev: ## Sobe todos os serviços em modo dev
	@$(COMPOSE) up --build

.PHONY: dev-bg
dev-bg: ## Sobe todos os serviços em background
	@$(COMPOSE) up --build -d
	@echo "$(GREEN)✓ Serviços rodando em background. Use 'make logs' para ver os logs.$(RESET)"

.PHONY: dev-infra
dev-infra: ## Sobe apenas a infraestrutura (postgres, redis, minio)
	@$(COMPOSE) up postgres redis minio -d
	@echo "$(GREEN)✓ Infraestrutura pronta.$(RESET)"

.PHONY: dev-api
dev-api: ## Roda o backend Go localmente (sem Docker)
	@cd $(API_DIR) && air -c .air.toml

.PHONY: dev-web
dev-web: ## Roda o frontend Next.js localmente
	@cd $(WEB_DIR) && pnpm dev

.PHONY: dev-engine
dev-engine: ## Roda o torrent engine localmente
	@cd $(ENGINE_DIR) && pnpm dev

# ─── Build ────────────────────────────────────────────────────────────────────
.PHONY: build
build: build-api build-web build-engine ## Build de produção de todos os serviços

.PHONY: build-api
build-api: ## Build do backend Go
	@echo "$(CYAN)→ Building API...$(RESET)"
	@cd $(API_DIR) && CGO_ENABLED=0 GOOS=linux go build \
		-ldflags="-w -s -X main.Version=$$(git describe --tags --always)" \
		-o bin/server ./cmd/server
	@echo "$(GREEN)✓ API built: $(API_DIR)/bin/server$(RESET)"

.PHONY: build-web
build-web: ## Build do frontend Next.js
	@echo "$(CYAN)→ Building Web...$(RESET)"
	@cd $(WEB_DIR) && pnpm build
	@echo "$(GREEN)✓ Web built.$(RESET)"

.PHONY: build-engine
build-engine: ## Build do torrent engine
	@echo "$(CYAN)→ Building Engine...$(RESET)"
	@cd $(ENGINE_DIR) && pnpm build
	@echo "$(GREEN)✓ Engine built.$(RESET)"

# ─── Testes ───────────────────────────────────────────────────────────────────
.PHONY: test
test: test-api test-web test-engine ## Roda todos os testes

.PHONY: test-api
test-api: ## Testes do backend Go
	@echo "$(CYAN)→ Testando API...$(RESET)"
	@cd $(API_DIR) && go test -v -race -coverprofile=coverage.out ./internal/...
	@cd $(API_DIR) && go tool cover -func=coverage.out | tail -1

.PHONY: test-web
test-web: ## Testes do frontend
	@echo "$(CYAN)→ Testando Web...$(RESET)"
	@cd $(WEB_DIR) && pnpm test --run

.PHONY: test-engine
test-engine: ## Testes do torrent engine
	@echo "$(CYAN)→ Testando Engine...$(RESET)"
	@cd $(ENGINE_DIR) && pnpm test --run

.PHONY: test-watch
test-watch: ## Testes em modo watch (todos)
	@cd $(WEB_DIR) && pnpm test &
	@cd $(ENGINE_DIR) && pnpm test &
	@cd $(API_DIR) && go test -v -race ./internal/... -count=1

.PHONY: test-e2e
test-e2e: ## Testes E2E com Playwright
	@cd $(WEB_DIR) && pnpm test:e2e

.PHONY: test-coverage
test-coverage: ## Relatório de coverage completo
	@cd $(API_DIR) && go test -coverprofile=coverage.out ./... && go tool cover -html=coverage.out -o coverage.html
	@cd $(WEB_DIR) && pnpm test --run --coverage
	@echo "$(GREEN)✓ Relatórios gerados.$(RESET)"

# ─── Lint ─────────────────────────────────────────────────────────────────────
.PHONY: lint
lint: lint-api lint-web lint-engine ## Lint em todos os serviços

.PHONY: lint-api
lint-api: ## Lint do Go
	@cd $(API_DIR) && golangci-lint run ./...

.PHONY: lint-web
lint-web: ## Lint do Next.js/TypeScript
	@cd $(WEB_DIR) && pnpm lint

.PHONY: lint-engine
lint-engine: ## Lint do torrent engine
	@cd $(ENGINE_DIR) && pnpm lint

.PHONY: fmt
fmt: ## Formata todo o código
	@cd $(API_DIR) && gofmt -w . && goimports -w .
	@pnpm prettier --write "apps/web/src/**/*.{ts,tsx}" "apps/torrent-engine/src/**/*.ts"

# ─── Banco de Dados / Migrations ──────────────────────────────────────────────
.PHONY: migrate-up
migrate-up: ## Roda todas as migrations pendentes
	@migrate -path $(MIGRATION_DIR) -database "$(DB_URL)" up
	@echo "$(GREEN)✓ Migrations aplicadas.$(RESET)"

.PHONY: migrate-down
migrate-down: ## Reverte a última migration
	@migrate -path $(MIGRATION_DIR) -database "$(DB_URL)" down 1

.PHONY: migrate-reset
migrate-reset: ## Reverte TODAS as migrations (cuidado!)
	@echo "$(YELLOW)⚠ Isso vai apagar todos os dados! Confirme com CTRL+C para cancelar...$(RESET)"
	@sleep 3
	@migrate -path $(MIGRATION_DIR) -database "$(DB_URL)" down -all

.PHONY: migrate-create
migrate-create: ## Cria nova migration (use: make migrate-create MIGRATION_NAME=add_users)
	@migrate create -ext sql -dir $(MIGRATION_DIR) -seq $(MIGRATION_NAME)
	@echo "$(GREEN)✓ Migration criada em $(MIGRATION_DIR)$(RESET)"

.PHONY: migrate-version
migrate-version: ## Versão atual da migration
	@migrate -path $(MIGRATION_DIR) -database "$(DB_URL)" version

.PHONY: seed
seed: ## Popula o banco com dados de desenvolvimento
	@cd $(API_DIR) && go run ./scripts/seed/main.go
	@echo "$(GREEN)✓ Seed aplicado.$(RESET)"

.PHONY: sqlc
sqlc: ## Gera código Go a partir das queries SQL (sqlc)
	@cd $(API_DIR) && sqlc generate
	@echo "$(GREEN)✓ sqlc gerado.$(RESET)"

.PHONY: mocks
mocks: ## Gera mocks com mockery para testes
	@cd $(API_DIR) && mockery --all --output internal/mocks
	@echo "$(GREEN)✓ Mocks gerados.$(RESET)"

# ─── Docker ───────────────────────────────────────────────────────────────────
.PHONY: up
up: ## docker compose up (dev)
	@$(COMPOSE) up -d

.PHONY: down
down: ## docker compose down
	@$(COMPOSE) down

.PHONY: clean
clean: ## Remove containers, volumes e dados locais
	@echo "$(YELLOW)⚠ Isso vai remover TODOS os dados! Aguarde 3s...$(RESET)"
	@sleep 3
	@$(COMPOSE) down -v --remove-orphans
	@echo "$(GREEN)✓ Limpo.$(RESET)"

.PHONY: rebuild
rebuild: ## Rebuild forçado de todos os containers
	@$(COMPOSE) build --no-cache
	@$(COMPOSE) up -d

.PHONY: logs
logs: ## Tail dos logs de todos os serviços
	@$(COMPOSE) logs -f --tail=50

.PHONY: logs-api
logs-api: ## Logs apenas da API Go
	@$(COMPOSE) logs -f api

.PHONY: logs-engine
logs-engine: ## Logs apenas do torrent engine
	@$(COMPOSE) logs -f torrent-engine

.PHONY: ps
ps: ## Status dos containers
	@$(COMPOSE) ps

.PHONY: shell-api
shell-api: ## Shell no container da API
	@$(COMPOSE) exec api sh

.PHONY: shell-db
shell-db: ## psql no container do banco
	@$(COMPOSE) exec postgres psql -U torrentleaf -d torrentleaf

.PHONY: shell-redis
shell-redis: ## redis-cli no container do Redis
	@$(COMPOSE) exec redis redis-cli

# ─── Monitoramento ────────────────────────────────────────────────────────────
.PHONY: monitoring
monitoring: ## Sobe Prometheus + Grafana
	@$(COMPOSE) --profile monitoring up -d prometheus grafana
	@echo "$(GREEN)✓ Grafana: http://localhost:3001 (admin/admin)$(RESET)"
	@echo "$(GREEN)✓ Prometheus: http://localhost:9091$(RESET)"

# ─── Utilitários ─────────────────────────────────────────────────────────────
.PHONY: swagger
swagger: ## Gera documentação Swagger da API Go
	@cd $(API_DIR) && swag init -g cmd/server/main.go -o docs/swagger
	@echo "$(GREEN)✓ Swagger em $(API_DIR)/docs/swagger$(RESET)"

.PHONY: audit
audit: ## Verifica vulnerabilidades de segurança
	@cd $(API_DIR) && govulncheck ./...
	@pnpm audit --audit-level high

.PHONY: check
check: lint test audit ## CI local: lint + testes + audit
	@echo "$(GREEN)✓ Tudo OK! Pronto para push.$(RESET)"

.PHONY: install
install: ## Instala todas as dependências Node (pnpm)
	@pnpm install

.PHONY: update-deps
update-deps: ## Atualiza dependências
	@cd $(API_DIR) && go get -u ./... && go mod tidy
	@pnpm update --interactive
