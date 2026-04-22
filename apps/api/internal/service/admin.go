package service

import (
	"context"
	"fmt"

	"github.com/google/uuid"

	"github.com/Dellareti/torrentleaf/api/internal/domain"
	"github.com/Dellareti/torrentleaf/api/internal/repository"
)

type AdminService interface {
	ListAllTorrents(ctx context.Context) ([]domain.TorrentSession, error)
	PauseTorrent(ctx context.Context, id uuid.UUID) error
	ResumeTorrent(ctx context.Context, id uuid.UUID) error
	DeleteTorrent(ctx context.Context, id uuid.UUID) error
}

type adminService struct {
	sessions repository.TorrentRepository
	engine   EngineClient
}

func NewAdminService(sessions repository.TorrentRepository, engine EngineClient) AdminService {
	return &adminService{sessions: sessions, engine: engine}
}

func (s *adminService) ListAllTorrents(ctx context.Context) ([]domain.TorrentSession, error) {
	return s.sessions.ListAll(ctx)
}

// PauseTorrent stops download by asking the engine to remove the torrent and
// sets the DB status to paused. The DB row is preserved so the user can
// resume later.
func (s *adminService) PauseTorrent(ctx context.Context, id uuid.UUID) error {
	session, err := s.sessions.GetByID(ctx, id)
	if err != nil {
		return err
	}
	if session.Status == domain.StatusPaused {
		return nil // idempotent
	}
	// Best-effort engine removal; if the engine is down the status still flips.
	_ = s.engine.Remove(ctx, session.InfoHash)
	return s.sessions.UpdateStatus(ctx, id, domain.StatusPaused)
}

// ResumeTorrent re-adds the magnet to the engine and transitions the status
// back to downloading.
func (s *adminService) ResumeTorrent(ctx context.Context, id uuid.UUID) error {
	session, err := s.sessions.GetByID(ctx, id)
	if err != nil {
		return err
	}
	if session.Status != domain.StatusPaused {
		return domain.NewError(domain.ErrInvalidInput,
			fmt.Sprintf("cannot resume session in status %s", session.Status), nil)
	}
	if session.MagnetURI != "" {
		if _, err := s.engine.Add(ctx, session.MagnetURI); err != nil {
			return fmt.Errorf("engine re-add: %w", err)
		}
	}
	return s.sessions.UpdateStatus(ctx, id, domain.StatusDownloading)
}

// DeleteTorrent removes the torrent from both the engine and the database.
func (s *adminService) DeleteTorrent(ctx context.Context, id uuid.UUID) error {
	session, err := s.sessions.GetByID(ctx, id)
	if err != nil {
		return err
	}
	_ = s.engine.Remove(ctx, session.InfoHash)
	return s.sessions.Delete(ctx, id)
}
