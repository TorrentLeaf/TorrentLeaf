# Skill: Go Patterns para TorrentLeaf

## Estrutura de Domínio

```go
// internal/domain/torrent.go
package domain

import (
    "time"
    "github.com/google/uuid"
)

type TorrentStatus string

const (
    StatusFetchingMetadata TorrentStatus = "fetching_metadata"
    StatusDownloading      TorrentStatus = "downloading"
    StatusSeeding          TorrentStatus = "seeding"
    StatusPaused           TorrentStatus = "paused"
    StatusError            TorrentStatus = "error"
)

type TorrentSession struct {
    ID               uuid.UUID
    UserID           uuid.UUID
    InfoHash         string
    MagnetURI        string
    Name             string
    Status           TorrentStatus
    TotalSize        int64
    DownloadedBytes  int64
    PeersCount       int
    DownloadSpeed    float64
    UploadSpeed      float64
    Files            []TorrentFile
    CreatedAt        time.Time
    UpdatedAt        time.Time
}

type TorrentFile struct {
    ID        uuid.UUID
    SessionID uuid.UUID
    Index     int
    Name      string
    Path      string
    Length    int64
    MimeType  string
    FileType  string
    Priority  int
}
```

## Interfaces de Repository

```go
// internal/domain/repository.go
package domain

import (
    "context"
    "github.com/google/uuid"
)

type TorrentRepository interface {
    Create(ctx context.Context, session TorrentSession) (*TorrentSession, error)
    GetByID(ctx context.Context, id uuid.UUID) (*TorrentSession, error)
    GetByInfoHash(ctx context.Context, infoHash string) (*TorrentSession, error)
    ListByUser(ctx context.Context, userID uuid.UUID) ([]TorrentSession, error)
    UpdateStatus(ctx context.Context, id uuid.UUID, status TorrentStatus) error
    Delete(ctx context.Context, id uuid.UUID) error
}

type TorrentFileRepository interface {
    CreateBatch(ctx context.Context, files []TorrentFile) error
    ListBySession(ctx context.Context, sessionID uuid.UUID) ([]TorrentFile, error)
    UpdatePriority(ctx context.Context, id uuid.UUID, priority int) error
}
```

## DTOs (Data Transfer Objects)

```go
// internal/handler/dto/torrent.go
package dto

type AddTorrentRequest struct {
    MagnetURI string `json:"magnetURI" validate:"required,startswith=magnet:"`
}

type TorrentResponse struct {
    ID       string        `json:"id"`
    InfoHash string        `json:"infoHash"`
    Name     string        `json:"name"`
    Status   string        `json:"status"`
    Files    []FileResponse `json:"files,omitempty"`
    Peers    int           `json:"peers"`
    Progress float64       `json:"progress"`
}
```

## Engine Client HTTP

```go
// pkg/engineclient/client.go
package engineclient

import (
    "bytes"
    "context"
    "encoding/json"
    "fmt"
    "net/http"
    "time"
)

type Client struct {
    baseURL    string
    httpClient *http.Client
}

func New(baseURL string) *Client {
    return &Client{
        baseURL: baseURL,
        httpClient: &http.Client{
            Timeout: 30 * time.Second,
        },
    }
}

func (c *Client) AddTorrent(ctx context.Context, magnetURI string) (string, error) {
    body, _ := json.Marshal(map[string]string{"magnetURI": magnetURI})
    req, err := http.NewRequestWithContext(ctx, "POST", 
        c.baseURL+"/engine/torrents", bytes.NewBuffer(body))
    if err != nil {
        return "", fmt.Errorf("engineclient.AddTorrent: create request: %w", err)
    }
    req.Header.Set("Content-Type", "application/json")
    
    resp, err := c.httpClient.Do(req)
    if err != nil {
        return "", fmt.Errorf("engineclient.AddTorrent: do request: %w", err)
    }
    defer resp.Body.Close()
    
    var result struct {
        InfoHash string `json:"infoHash"`
    }
    if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
        return "", fmt.Errorf("engineclient.AddTorrent: decode response: %w", err)
    }
    return result.InfoHash, nil
}
```

## Setup do Fiber App

```go
// cmd/server/main.go
func setupApp(cfg *config.Config, deps *Dependencies) *fiber.App {
    app := fiber.New(fiber.Config{
        ErrorHandler: middleware.ErrorHandler,
        ReadTimeout:  30 * time.Second,
        WriteTimeout: 30 * time.Second,
    })

    // Middlewares globais
    app.Use(middleware.Logger(deps.Logger))
    app.Use(middleware.CORS(cfg))
    app.Use(middleware.RateLimit(deps.Redis))

    // Routes
    api := app.Group("/api/v1")
    
    auth := handler.NewAuthHandler(deps.AuthService)
    api.Post("/auth/register", auth.Register)
    api.Post("/auth/login", auth.Login)
    api.Post("/auth/refresh", auth.Refresh)
    
    // Rotas protegidas
    protected := api.Group("", middleware.JWT(cfg.JWTSecret))
    
    torrents := handler.NewTorrentHandler(deps.TorrentService)
    protected.Post("/torrents", torrents.Add)
    protected.Get("/torrents", torrents.List)
    protected.Get("/torrents/:id", torrents.Get)
    protected.Delete("/torrents/:id", torrents.Delete)
    
    reader := handler.NewReaderHandler(deps.ReaderService)
    protected.Get("/reader/:id/pages", reader.GetPages)
    protected.Get("/stream/:fileId/:page", reader.StreamPage)
    
    // WebSocket
    app.Get("/ws/torrents/:id", websocket.New(handler.NewWSHandler(deps.Redis).Progress))
    
    // Health + Metrics
    app.Get("/health", func(c *fiber.Ctx) error {
        return c.JSON(fiber.Map{"status": "ok"})
    })
    app.Get("/metrics", adaptor.HTTPHandler(promhttp.Handler()))
    
    return app
}
```
