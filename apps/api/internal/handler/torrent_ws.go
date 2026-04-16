package handler

import (
	"context"
	"encoding/json"

	"github.com/gofiber/contrib/websocket"
	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/redis/go-redis/v9"
	"github.com/rs/zerolog"

	"github.com/seuuser/torrentleaf/api/internal/middleware"
	"github.com/seuuser/torrentleaf/api/internal/service"
)

// TorrentWSHandler streams real-time torrent progress via WebSocket. Upgrade
// is gated by RequireAuth (access token provided via Authorization header or
// ?token= query string — see Upgrade below), and ownership is checked before
// subscribing to the Redis channel.
type TorrentWSHandler struct {
	log    zerolog.Logger
	svc    service.TorrentService
	redis  *redis.Client
}

func NewTorrentWSHandler(log zerolog.Logger, svc service.TorrentService, r *redis.Client) *TorrentWSHandler {
	return &TorrentWSHandler{log: log, svc: svc, redis: r}
}

// Upgrade is the pre-upgrade Fiber handler. It validates ownership of the
// torrent session, stores the infoHash in locals, then defers to websocket.New.
func (h *TorrentWSHandler) Upgrade(c *fiber.Ctx) error {
	if !websocket.IsWebSocketUpgrade(c) {
		return fiber.ErrUpgradeRequired
	}
	userID, ok := middleware.UserID(c)
	if !ok {
		return fiber.ErrUnauthorized
	}
	id, err := uuid.Parse(c.Params("id"))
	if err != nil {
		return fiber.NewError(fiber.StatusBadRequest, "invalid id")
	}
	session, err := h.svc.Get(c.Context(), userID, id)
	if err != nil {
		return mapTorrentError(err)
	}
	c.Locals("infoHash", session.InfoHash)
	return c.Next()
}

// Stream is the websocket.New handler. Subscribes to the Redis progress
// channel for the session and forwards every message to the client.
func (h *TorrentWSHandler) Stream(c *websocket.Conn) {
	defer c.Close()

	infoHash, _ := c.Locals("infoHash").(string)
	if infoHash == "" {
		return
	}

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	pubsub := h.redis.Subscribe(ctx, "torrent:progress:"+infoHash)
	defer func() { _ = pubsub.Close() }()

	// Close the connection if the client goes away.
	go func() {
		for {
			if _, _, err := c.ReadMessage(); err != nil {
				cancel()
				return
			}
		}
	}()

	// Send a ping so the client knows the subscription is live.
	_ = c.WriteJSON(map[string]string{"type": "subscribed", "infoHash": infoHash})

	ch := pubsub.Channel()
	for {
		select {
		case <-ctx.Done():
			return
		case msg, ok := <-ch:
			if !ok {
				return
			}
			// Payload is already JSON from the engine — forward verbatim.
			if !json.Valid([]byte(msg.Payload)) {
				h.log.Warn().Str("payload", msg.Payload).Msg("dropping non-JSON progress message")
				continue
			}
			if err := c.WriteMessage(websocket.TextMessage, []byte(msg.Payload)); err != nil {
				return
			}
		}
	}
}
