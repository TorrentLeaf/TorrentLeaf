.PHONY: help build run test test-watch lint tidy sqlc migrate-up migrate-down

help:
	@echo "Targets disponíveis:"
	@echo "  build        - compila o binário em ./tmp/server"
	@echo "  run          - executa localmente com air (hot reload)"
	@echo "  test         - roda testes com cobertura"
	@echo "  lint         - roda go vet e golangci-lint"
	@echo "  tidy         - atualiza go.mod / go.sum"
	@echo "  sqlc         - gera código a partir de sqlc.yaml"
	@echo "  migrate-up   - aplica migrations pendentes"
	@echo "  migrate-down - reverte a última migration"

build:
	go build -ldflags="-w -s" -o ./tmp/server ./cmd/server

run:
	air -c .air.toml

test:
	go test -race -cover ./...

test-watch:
	go test -race -count=1 ./... -v

lint:
	go vet ./...
	@command -v golangci-lint >/dev/null && golangci-lint run ./... || echo "golangci-lint não instalado — pulando"

tidy:
	go mod tidy

sqlc:
	sqlc generate -f sqlc/sqlc.yaml

DB_URL ?= postgresql://torrentleaf:secret@localhost:5432/torrentleaf?sslmode=disable

migrate-up:
	migrate -path migrations -database "$(DB_URL)" up

migrate-down:
	migrate -path migrations -database "$(DB_URL)" down 1
