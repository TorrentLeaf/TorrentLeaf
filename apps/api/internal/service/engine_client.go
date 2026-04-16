package service

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"
)

// EngineClient talks to the Node.js torrent-engine over HTTP.
type EngineClient interface {
	Add(ctx context.Context, magnetURI string) (EngineTorrentStatus, error)
	Remove(ctx context.Context, infoHash string) error
	SetPriority(ctx context.Context, infoHash string, fileIndex, priority int) error
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

type httpEngineClient struct {
	baseURL string
	http    *http.Client
}

func NewEngineClient(baseURL string) EngineClient {
	return &httpEngineClient{
		baseURL: baseURL,
		http:    &http.Client{Timeout: 60 * time.Second},
	}
}

func (c *httpEngineClient) Add(ctx context.Context, magnetURI string) (EngineTorrentStatus, error) {
	body, _ := json.Marshal(map[string]string{"magnetURI": magnetURI})
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
