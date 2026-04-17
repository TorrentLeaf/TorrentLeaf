package service

import (
	"context"
	"errors"
	"sync"
	"testing"
	"time"

	"github.com/google/uuid"

	"github.com/seuuser/torrentleaf/api/internal/domain"
)

// ─── In-memory repo fakes ─────────────────────────────────────────────────────

type fakeTorrentRepo struct {
	mu       sync.Mutex
	sessions map[uuid.UUID]*domain.TorrentSession
	byHash   map[string]*domain.TorrentSession
}

func newFakeTorrentRepo() *fakeTorrentRepo {
	return &fakeTorrentRepo{
		sessions: map[uuid.UUID]*domain.TorrentSession{},
		byHash:   map[string]*domain.TorrentSession{},
	}
}

func (r *fakeTorrentRepo) Create(_ context.Context, s domain.TorrentSession) (*domain.TorrentSession, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	if _, ok := r.byHash[s.InfoHash]; ok {
		return nil, domain.NewError(domain.ErrConflict, "torrent already added", nil)
	}
	s.ID = uuid.New()
	s.CreatedAt = time.Now()
	s.UpdatedAt = s.CreatedAt
	cp := s
	r.sessions[s.ID] = &cp
	r.byHash[s.InfoHash] = &cp
	return &cp, nil
}

func (r *fakeTorrentRepo) GetByID(_ context.Context, id uuid.UUID) (*domain.TorrentSession, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	s, ok := r.sessions[id]
	if !ok {
		return nil, domain.NewError(domain.ErrNotFound, "not found", nil)
	}
	return s, nil
}

func (r *fakeTorrentRepo) GetByInfoHash(_ context.Context, h string) (*domain.TorrentSession, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	s, ok := r.byHash[h]
	if !ok {
		return nil, domain.NewError(domain.ErrNotFound, "not found", nil)
	}
	return s, nil
}

func (r *fakeTorrentRepo) ListByUser(_ context.Context, userID uuid.UUID) ([]domain.TorrentSession, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	var out []domain.TorrentSession
	for _, s := range r.sessions {
		if s.UserID == userID {
			out = append(out, *s)
		}
	}
	return out, nil
}

func (r *fakeTorrentRepo) ListAll(_ context.Context) ([]domain.TorrentSession, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	out := make([]domain.TorrentSession, 0, len(r.sessions))
	for _, s := range r.sessions {
		out = append(out, *s)
	}
	return out, nil
}

func (r *fakeTorrentRepo) UpdateStatus(_ context.Context, id uuid.UUID, st domain.TorrentStatus) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	s, ok := r.sessions[id]
	if !ok {
		return domain.NewError(domain.ErrNotFound, "not found", nil)
	}
	s.Status = st
	return nil
}

func (r *fakeTorrentRepo) UpdateMetadata(_ context.Context, hash, name string, total int64) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	s, ok := r.byHash[hash]
	if !ok {
		return domain.NewError(domain.ErrNotFound, "not found", nil)
	}
	s.Name = name
	s.TotalSize = total
	s.Status = domain.StatusDownloading
	return nil
}

func (r *fakeTorrentRepo) Delete(_ context.Context, id uuid.UUID) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	s, ok := r.sessions[id]
	if !ok {
		return domain.NewError(domain.ErrNotFound, "not found", nil)
	}
	delete(r.sessions, id)
	delete(r.byHash, s.InfoHash)
	return nil
}

type fakeFileRepo struct {
	mu    sync.Mutex
	files map[uuid.UUID][]domain.TorrentFile
}

func newFakeFileRepo() *fakeFileRepo {
	return &fakeFileRepo{files: map[uuid.UUID][]domain.TorrentFile{}}
}

func (r *fakeFileRepo) CreateBatch(_ context.Context, files []domain.TorrentFile) error {
	r.mu.Lock()
	defer r.mu.Unlock()
	for _, f := range files {
		if f.ID == uuid.Nil {
			f.ID = uuid.New()
		}
		r.files[f.SessionID] = append(r.files[f.SessionID], f)
	}
	return nil
}

func (r *fakeFileRepo) ListBySession(_ context.Context, sid uuid.UUID) ([]domain.TorrentFile, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	return r.files[sid], nil
}

func (r *fakeFileRepo) GetByID(_ context.Context, id uuid.UUID) (*domain.TorrentFile, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	for _, list := range r.files {
		for i := range list {
			if list[i].ID == id {
				cp := list[i]
				return &cp, nil
			}
		}
	}
	return nil, domain.NewError(domain.ErrNotFound, "file not found", nil)
}

func (r *fakeFileRepo) UpdatePriority(_ context.Context, _ uuid.UUID, _ int) error {
	return nil
}

// ─── Engine fake ──────────────────────────────────────────────────────────────

type fakeEngine struct {
	addErr      error
	addCalls    []string
	removeCalls []string
	priorityCalls []struct {
		Hash        string
		Idx, Prio int
	}
}

func (e *fakeEngine) Add(_ context.Context, magnet string) (EngineTorrentStatus, error) {
	e.addCalls = append(e.addCalls, magnet)
	if e.addErr != nil {
		return EngineTorrentStatus{}, e.addErr
	}
	return EngineTorrentStatus{InfoHash: "deadbeef", Ready: false}, nil
}

func (e *fakeEngine) Remove(_ context.Context, hash string) error {
	e.removeCalls = append(e.removeCalls, hash)
	return nil
}

func (e *fakeEngine) SetPriority(_ context.Context, hash string, idx, prio int) error {
	e.priorityCalls = append(e.priorityCalls, struct {
		Hash        string
		Idx, Prio int
	}{hash, idx, prio})
	return nil
}

// ─── Tests ────────────────────────────────────────────────────────────────────

const validMagnet = "magnet:?xt=urn:btih:0123456789abcdef0123456789abcdef01234567&dn=example"

func newTestTorrentSvc() (TorrentService, *fakeTorrentRepo, *fakeFileRepo, *fakeEngine) {
	sr := newFakeTorrentRepo()
	fr := newFakeFileRepo()
	e := &fakeEngine{}
	return NewTorrentService(sr, fr, e), sr, fr, e
}

func TestAddRejectsInvalidMagnet(t *testing.T) {
	svc, _, _, _ := newTestTorrentSvc()
	_, err := svc.Add(context.Background(), uuid.New(), "not-a-magnet")
	var de *domain.Error
	if !errors.As(err, &de) || de.Code != domain.ErrInvalidInput {
		t.Fatalf("expected ErrInvalidInput, got %v", err)
	}
}

func TestAddCreatesSessionAndCallsEngine(t *testing.T) {
	svc, sr, _, e := newTestTorrentSvc()
	userID := uuid.New()

	session, err := svc.Add(context.Background(), userID, validMagnet)
	if err != nil {
		t.Fatalf("add: %v", err)
	}
	if session.Status != domain.StatusFetchingMetadata {
		t.Errorf("wrong initial status: %s", session.Status)
	}
	if session.InfoHash != "0123456789abcdef0123456789abcdef01234567" {
		t.Errorf("info hash not normalized: %s", session.InfoHash)
	}
	if len(e.addCalls) != 1 {
		t.Errorf("engine.Add called %d times", len(e.addCalls))
	}
	if _, err := sr.GetByID(context.Background(), session.ID); err != nil {
		t.Errorf("session not persisted: %v", err)
	}
}

func TestAddIsIdempotentForSameUser(t *testing.T) {
	svc, _, _, e := newTestTorrentSvc()
	userID := uuid.New()

	first, err := svc.Add(context.Background(), userID, validMagnet)
	if err != nil {
		t.Fatalf("first add: %v", err)
	}
	second, err := svc.Add(context.Background(), userID, validMagnet)
	if err != nil {
		t.Fatalf("second add: %v", err)
	}
	if first.ID != second.ID {
		t.Errorf("expected same session on idempotent re-add")
	}
	if len(e.addCalls) != 1 {
		t.Errorf("engine should not be called twice, got %d calls", len(e.addCalls))
	}
}

func TestAddConflictAcrossUsers(t *testing.T) {
	svc, _, _, _ := newTestTorrentSvc()
	if _, err := svc.Add(context.Background(), uuid.New(), validMagnet); err != nil {
		t.Fatalf("first add: %v", err)
	}
	_, err := svc.Add(context.Background(), uuid.New(), validMagnet)
	var de *domain.Error
	if !errors.As(err, &de) || de.Code != domain.ErrConflict {
		t.Fatalf("expected ErrConflict, got %v", err)
	}
}

func TestAddRollsBackOnEngineFailure(t *testing.T) {
	svc, sr, _, e := newTestTorrentSvc()
	e.addErr = errors.New("engine down")

	_, err := svc.Add(context.Background(), uuid.New(), validMagnet)
	if err == nil {
		t.Fatal("expected error when engine fails")
	}
	if _, err := sr.GetByInfoHash(context.Background(), "0123456789abcdef0123456789abcdef01234567"); err == nil {
		t.Fatal("session should have been rolled back")
	}
}

func TestApplyMetadataPersistsFilesAndTransitionsStatus(t *testing.T) {
	svc, sr, fr, _ := newTestTorrentSvc()
	userID := uuid.New()
	session, _ := svc.Add(context.Background(), userID, validMagnet)

	err := svc.ApplyMetadata(context.Background(), session.InfoHash, "My Manga", 1024,
		[]MetadataFile{
			{Index: 0, Name: "ch01.cbz", Path: "ch01.cbz", Length: 500, MimeType: "application/vnd.comicbook+zip", FileType: "cbz"},
			{Index: 1, Name: "ch02.cbz", Path: "ch02.cbz", Length: 524, MimeType: "application/vnd.comicbook+zip", FileType: "cbz"},
		})
	if err != nil {
		t.Fatalf("apply metadata: %v", err)
	}

	got, err := sr.GetByID(context.Background(), session.ID)
	if err != nil {
		t.Fatalf("lookup: %v", err)
	}
	if got.Name != "My Manga" || got.TotalSize != 1024 {
		t.Errorf("metadata not applied: %+v", got)
	}
	if got.Status != domain.StatusDownloading {
		t.Errorf("status not transitioned: %s", got.Status)
	}
	files, _ := fr.ListBySession(context.Background(), session.ID)
	if len(files) != 2 {
		t.Errorf("expected 2 files, got %d", len(files))
	}
	if files[0].FileType != domain.FileTypeCBZ {
		t.Errorf("file_type not normalized: %s", files[0].FileType)
	}
}

func TestGetScopesByUser(t *testing.T) {
	svc, _, _, _ := newTestTorrentSvc()
	owner := uuid.New()
	other := uuid.New()
	session, _ := svc.Add(context.Background(), owner, validMagnet)

	if _, err := svc.Get(context.Background(), owner, session.ID); err != nil {
		t.Errorf("owner should see session: %v", err)
	}
	_, err := svc.Get(context.Background(), other, session.ID)
	var de *domain.Error
	if !errors.As(err, &de) || de.Code != domain.ErrNotFound {
		t.Errorf("other user should get ErrNotFound, got %v", err)
	}
}

func TestSetPriorityValidatesRange(t *testing.T) {
	svc, _, _, _ := newTestTorrentSvc()
	userID := uuid.New()
	session, _ := svc.Add(context.Background(), userID, validMagnet)

	for _, p := range []int{-1, 3, 99} {
		err := svc.SetPriority(context.Background(), userID, session.ID, 0, p)
		var de *domain.Error
		if !errors.As(err, &de) || de.Code != domain.ErrInvalidInput {
			t.Errorf("priority %d: expected ErrInvalidInput, got %v", p, err)
		}
	}
}
