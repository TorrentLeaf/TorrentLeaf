package service

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"time"
)

// EngineClient talks to the Node.js torrent-engine over HTTP.
type EngineClient interface {
	Add(ctx context.Context, magnetURI string, downloadPath string) (EngineTorrentStatus, error)
	Remove(ctx context.Context, infoHash string) error
	SetPriority(ctx context.Context, infoHash string, fileIndex, priority int) error
	ListArchiveEntries(ctx context.Context, infoHash string, fileIndex int) ([]EngineArchiveEntry, error)
}

type EngineTorrentStatus struct {
	InfoHash      string  `json:"infoHash"`
	Name          string  `json:"name"`
	Ready         bool    `json:"ready"`
	Progress      float64 `json:"progress"`
	DownloadSpeed float64 `json:"downloadSpeed"`
	UploadSpeed   float64 `json:"uploadSpeed"`
	Peers         int     `json:"peers"`
	Length        int64   `json:"length"`
	Downloaded    int64   `json:"downloaded"`
}

// EngineArchiveEntry mirrors the engine's `/engine/archive/.../entries` shape.
type EngineArchiveEntry struct {
	Index    int    `json:"index"`
	Name     string `json:"name"`
	Size     int64  `json:"size"`
	MimeType string `json:"mimeType"`
}

type httpEngineClient struct {
	baseURL string
	http    *http.Client
}

func NewEngineClient(baseURL string) EngineClient {
	return &httpEngineClient{
		baseURL: baseURL,
		http:    &http.Client{Timeout: 15 * time.Second},
	}
}

func (c *httpEngineClient) Add(ctx context.Context, magnetURI string, downloadPath string) (EngineTorrentStatus, error) {
	payload := map[string]string{"magnetURI": magnetURI}
	if downloadPath != "" {
		payload["downloadPath"] = downloadPath
	}
	body, _ := json.Marshal(payload)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost,
		c.baseURL+"/engine/torrents", bytes.NewReader(body))
	if err != nil {
		return EngineTorrentStatus{}, err
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.http.Do(req)
	if err != nil {
		return EngineTorrentStatus{}, fmt.Errorf("engine add: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 400 {
		raw, _ := io.ReadAll(resp.Body)
		return EngineTorrentStatus{}, fmt.Errorf("engine add returned %d: %s", resp.StatusCode, string(raw))
	}

	var status EngineTorrentStatus
	if err := json.NewDecoder(resp.Body).Decode(&status); err != nil {
		return EngineTorrentStatus{}, fmt.Errorf("decode engine response: %w", err)
	}
	return status, nil
}

func (c *httpEngineClient) Remove(ctx context.Context, infoHash string) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodDelete,
		c.baseURL+"/engine/torrents/"+infoHash, nil)
	if err != nil {
		return err
	}
	resp, err := c.http.Do(req)
	if err != nil {
		return fmt.Errorf("engine remove: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 && resp.StatusCode != http.StatusNotFound {
		return fmt.Errorf("engine remove returned %d", resp.StatusCode)
	}
	return nil
}

// ErrArchiveNotReady is returned by ListArchiveEntries when the engine
// reports 503 — i.e., torrent metadata or central-directory pieces haven't
// arrived from the swarm yet. Callers should translate this to a retryable
// response for the end user.
var ErrArchiveNotReady = errors.New("archive not ready")

func (c *httpEngineClient) ListArchiveEntries(ctx context.Context, infoHash string, fileIndex int) ([]EngineArchiveEntry, error) {
	url := fmt.Sprintf("%s/engine/archive/%s/%d/entries", c.baseURL, infoHash, fileIndex)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, err
	}
	resp, err := c.http.Do(req)
	if err != nil {
		return nil, fmt.Errorf("engine archive entries: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode == http.StatusServiceUnavailable {
		return nil, ErrArchiveNotReady
	}
	if resp.StatusCode >= 400 {
		raw, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("engine archive entries returned %d: %s", resp.StatusCode, string(raw))
	}
	var entries []EngineArchiveEntry
	if err := json.NewDecoder(resp.Body).Decode(&entries); err != nil {
		return nil, fmt.Errorf("decode engine archive entries: %w", err)
	}
	return entries, nil
}

func (c *httpEngineClient) SetPriority(ctx context.Context, infoHash string, fileIndex, priority int) error {
	body, _ := json.Marshal(map[string]int{"fileIndex": fileIndex, "priority": priority})
	req, err := http.NewRequestWithContext(ctx, http.MethodPost,
		c.baseURL+"/engine/torrents/"+infoHash+"/priority", bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	resp, err := c.http.Do(req)
	if err != nil {
		return fmt.Errorf("engine priority: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		raw, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("engine priority returned %d: %s", resp.StatusCode, string(raw))
	}
	return nil
}
