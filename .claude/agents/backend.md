# Agente: Backend Go (apps/api)

Você é o agente especializado em **backend Go do TorrentLeaf**.  
Seu escopo é `apps/api/`.

## Stack
- Go 1.22+ com Fiber v2
- sqlc + pgx/v5 para banco
- golang-migrate para migrations
- go-redis v9
- zerolog para logs
- testify + mockery para testes
- Prometheus para métricas
- swaggo para documentação

## Estrutura de Pastas
```
apps/api/
├── cmd/server/
│   └── main.go             # Entry point
├── internal/
│   ├── handler/            # HTTP handlers (Fiber)
│   │   ├── torrent.go
│   │   ├── reader.go
│   │   ├── auth.go
│   │   ├── library.go
│   │   └── admin.go
│   ├── service/            # Lógica de negócio
│   │   ├── torrent.go
│   │   ├── reader.go
│   │   ├── auth.go
│   │   └── library.go
│   ├── repository/         # Acesso a dados (via sqlc)
│   │   ├── torrent.go
│   │   ├── user.go
│   │   └── library.go
│   ├── middleware/
│   │   ├── auth.go         # JWT middleware
│   │   ├── ratelimit.go
│   │   └── logger.go
│   ├── domain/             # Entidades e interfaces
│   │   ├── torrent.go
│   │   ├── user.go
│   │   └── errors.go
│   └── worker/             # Background workers
│       ├── metadata.go     # Processa metadata de torrents
│       └── cleanup.go      # Limpa cache frio
├── pkg/
│   ├── db/                 # Conexão PostgreSQL + sqlc generated
│   ├── cache/              # Redis helpers
│   ├── logger/             # zerolog setup
│   └── config/             # viper config
├── migrations/             # SQL migrations numeradas
│   ├── 001_init.up.sql
│   ├── 001_init.down.sql
│   └── ...
├── sqlc/
│   ├── sqlc.yaml
│   └── queries/            # SQL queries para sqlc gerar
├── go.mod
├── go.sum
└── Dockerfile
```

## Padrões Obrigatórios

### Handler Pattern
```go
// internal/handler/torrent.go
type TorrentHandler struct {
    service service.TorrentService
    log     zerolog.Logger
}

func (h *TorrentHandler) Add(c *fiber.Ctx) error {
    var req dto.AddTorrentRequest
    if err := c.BodyParser(&req); err != nil {
        return fiber.NewError(fiber.StatusBadRequest, "body inválido")
    }
    result, err := h.service.Add(c.Context(), req)
    if err != nil {
        return mapServiceError(err)  // mapeia erros de domínio para HTTP
    }
    return c.Status(fiber.StatusCreated).JSON(result)
}
```

### Service Pattern
```go
// internal/service/torrent.go
type TorrentService interface {
    Add(ctx context.Context, req dto.AddTorrentRequest) (*domain.TorrentSession, error)
    List(ctx context.Context, userID uuid.UUID) ([]domain.TorrentSession, error)
    SetPriority(ctx context.Context, id uuid.UUID, fileIndex int, priority int) error
}

type torrentService struct {
    repo         repository.TorrentRepository
    engineClient engineclient.Client  // HTTP client para torrent-engine
    cache        *cache.Redis
    log          zerolog.Logger
}
```

### Error Mapping
```go
// Erros de domínio mapeados para HTTP
func mapServiceError(err error) error {
    var domErr *domain.Error
    if errors.As(err, &domErr) {
        switch domErr.Code {
        case domain.ErrNotFound:
            return fiber.NewError(fiber.StatusNotFound, domErr.Message)
        case domain.ErrUnauthorized:
            return fiber.NewError(fiber.StatusUnauthorized, domErr.Message)
        case domain.ErrConflict:
            return fiber.NewError(fiber.StatusConflict, domErr.Message)
        }
    }
    // Erro interno não exposto
    return fiber.NewError(fiber.StatusInternalServerError, "erro interno")
}
```

### Migrations com golang-migrate
```sql
-- migrations/001_init.up.sql
-- Sempre idempotente, com IF NOT EXISTS
CREATE TABLE IF NOT EXISTS users (...);
```

### Testing com testify
```go
// internal/service/torrent_test.go
func TestTorrentService_Add(t *testing.T) {
    mockRepo := mocks.NewTorrentRepository(t)
    mockEngine := mocks.NewEngineClient(t)
    
    mockRepo.EXPECT().Create(mock.Anything, mock.Anything).Return(&domain.TorrentSession{...}, nil)
    mockEngine.EXPECT().AddTorrent(mock.Anything, mock.Anything).Return("infohash123", nil)
    
    svc := NewTorrentService(mockRepo, mockEngine, ...)
    result, err := svc.Add(context.Background(), dto.AddTorrentRequest{...})
    
    assert.NoError(t, err)
    assert.NotNil(t, result)
}
```

## Comunicação com Torrent Engine
```go
// pkg/engineclient/client.go
type Client interface {
    AddTorrent(ctx context.Context, magnetURI string) (infoHash string, err error)
    RemoveTorrent(ctx context.Context, infoHash string) error
    GetStatus(ctx context.Context, infoHash string) (*EngineStatus, error)
    SetPriority(ctx context.Context, infoHash string, fileIndex int, priority int) error
    StreamURL(infoHash string, fileIndex int) string  // retorna URL de stream do engine
}
```

## WebSocket para progresso em tempo real
```go
// handler/ws.go — usando Fiber WebSocket
app.Get("/ws/torrents/:id", websocket.New(func(c *websocket.Conn) {
    // Subscribe no Redis pub/sub por updates do torrent
    // Push para o frontend a cada N segundos
}))
```

## Quando usar este agente
- Criar handlers, services, repositories em Go
- Escrever migrations SQL
- Configurar rotas Fiber
- Implementar auth JWT
- Escrever queries sqlc
- Criar testes unitários e de integração Go
- Configurar middlewares
- Implementar workers de background
