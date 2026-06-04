package service

import (
	"context"
	"errors"
	"strconv"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/google/uuid"

	"github.com/Dellareti/torrentleaf/api/internal/domain"
	"github.com/Dellareti/torrentleaf/api/internal/repository"
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
	// Unique constraint is now (user_id, info_hash) not just info_hash
	key := s.UserID.String() + ":" + s.InfoHash
	if _, ok := r.byHash[key]; ok {
		return nil, domain.NewError(domain.ErrConflict, "torrent already added", nil)
	}
	s.ID = uuid.New()
	s.CreatedAt = time.Now()
	s.UpdatedAt = s.CreatedAt
	cp := s
	r.sessions[s.ID] = &cp
	r.byHash[key] = &cp
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
	for _, s := range r.sessions {
		if s.InfoHash == h {
			return s, nil
		}
	}
	return nil, domain.NewError(domain.ErrNotFound, "not found", nil)
}

func (r *fakeTorrentRepo) GetByUserAndInfoHash(_ context.Context, userID uuid.UUID, h string) (*domain.TorrentSession, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	key := userID.String() + ":" + h
	s, ok := r.byHash[key]
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
	// byHash is keyed by userID:hash, so iterate to update every user's row.
	found := false
	for _, s := range r.sessions {
		if s.InfoHash == hash {
			s.Name = name
			s.TotalSize = total
			s.Status = domain.StatusDownloading
			found = true
		}
	}
	if !found {
		return domain.NewError(domain.ErrNotFound, "not found", nil)
	}
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
	delete(r.byHash, s.UserID.String()+":"+s.InfoHash)
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

// ─── Settings fake ────────────────────────────────────────────────────────────

type fakeSettingsRepo struct {
	mu       sync.Mutex
	settings map[uuid.UUID]*domain.UserSettings
}

func newFakeSettingsRepo() *fakeSettingsRepo {
	return &fakeSettingsRepo{settings: map[uuid.UUID]*domain.UserSettings{}}
}

func (r *fakeSettingsRepo) GetByUserID(_ context.Context, userID uuid.UUID) (*domain.UserSettings, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	if s, ok := r.settings[userID]; ok {
		cp := *s
		return &cp, nil
	}
	// Mirror the DB defaults from migration 004: every column is NOT NULL
	// with a default, so a freshly-auto-created row should match.
	s := &domain.UserSettings{ID: uuid.New(), UserID: userID, AutoAddLibrary: true}
	r.settings[userID] = s
	cp := *s
	return &cp, nil
}

func (r *fakeSettingsRepo) Upsert(_ context.Context, s domain.UserSettings) (*domain.UserSettings, error) {
	r.mu.Lock()
	defer r.mu.Unlock()
	if s.ID == uuid.Nil {
		s.ID = uuid.New()
	}
	cp := s
	r.settings[s.UserID] = &cp
	return &cp, nil
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
	archiveEntries map[string][]EngineArchiveEntry // keyed by "hash:fileIdx"
	archiveErr     error
}

func (e *fakeEngine) Add(_ context.Context, magnet string, _ string) (EngineTorrentStatus, error) {
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

func (e *fakeEngine) ListArchiveEntries(_ context.Context, hash string, fileIdx int) ([]EngineArchiveEntry, error) {
	if e.archiveErr != nil {
		return nil, e.archiveErr
	}
	if e.archiveEntries == nil {
		return nil, nil
	}
	return e.archiveEntries[hash+":"+strconv.Itoa(fileIdx)], nil
}

// ─── Tests ────────────────────────────────────────────────────────────────────

const validMagnet = "magnet:?xt=urn:btih:0123456789abcdef0123456789abcdef01234567&dn=example"

func newTestTorrentSvc() (TorrentService, *fakeTorrentRepo, *fakeFileRepo, *fakeEngine) {
	sr := newFakeTorrentRepo()
	fr := newFakeFileRepo()
	lr := newFakeLibraryRepo()
	stRepo := newFakeSettingsRepo()
	e := &fakeEngine{}
	return NewTorrentService(sr, fr, lr, stRepo, e), sr, fr, e
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

func TestAddAcrossUsersSucceeds(t *testing.T) {
	svc, _, _, e := newTestTorrentSvc()
	user1 := uuid.New()
	user2 := uuid.New()

	s1, err := svc.Add(context.Background(), user1, validMagnet)
	if err != nil {
		t.Fatalf("first add: %v", err)
	}
	s2, err := svc.Add(context.Background(), user2, validMagnet)
	if err != nil {
		t.Fatalf("second add should succeed for different user: %v", err)
	}
	if s1.ID == s2.ID {
		t.Errorf("sessions should be distinct for different users")
	}
	if s1.InfoHash != s2.InfoHash {
		t.Errorf("both sessions should share the same info hash")
	}
	// Engine.Add should be called twice (once per user)
	if len(e.addCalls) != 2 {
		t.Errorf("engine.Add should be called %d times, got %d", 2, len(e.addCalls))
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

func TestAddAutoShelvesToLibrary(t *testing.T) {
	sr := newFakeTorrentRepo()
	fr := newFakeFileRepo()
	lr := newFakeLibraryRepo()
	stRepo := newFakeSettingsRepo()
	svc := NewTorrentService(sr, fr, lr, stRepo, &fakeEngine{})
	userID := uuid.New()

	session, err := svc.Add(context.Background(), userID, validMagnet)
	if err != nil {
		t.Fatalf("add: %v", err)
	}
	items, _ := lr.ListByUser(context.Background(), userID, repository.LibraryListFilter{})
	if len(items) != 1 {
		t.Fatalf("expected 1 library item, got %d", len(items))
	}
	if items[0].Item.SessionID != session.ID {
		t.Errorf("library item points to wrong session")
	}
	if items[0].Item.Title != session.InfoHash {
		t.Errorf("placeholder title should be infoHash, got %q", items[0].Item.Title)
	}

	_ = svc.ApplyMetadata(context.Background(), session.InfoHash, "Real Name", 1024, nil)

	items, _ = lr.ListByUser(context.Background(), userID, repository.LibraryListFilter{})
	if items[0].Item.Title != "Real Name" {
		t.Errorf("title should update to real name after metadata, got %q", items[0].Item.Title)
	}
}

func TestAddSkipsLibraryWhenAutoAddDisabled(t *testing.T) {
	sr := newFakeTorrentRepo()
	fr := newFakeFileRepo()
	lr := newFakeLibraryRepo()
	stRepo := newFakeSettingsRepo()
	svc := NewTorrentService(sr, fr, lr, stRepo, &fakeEngine{})
	userID := uuid.New()

	// User opted out of auto-shelving.
	_, _ = stRepo.Upsert(context.Background(), domain.UserSettings{
		UserID:         userID,
		AutoAddLibrary: false,
	})

	if _, err := svc.Add(context.Background(), userID, validMagnet); err != nil {
		t.Fatalf("add: %v", err)
	}
	items, _ := lr.ListByUser(context.Background(), userID, repository.LibraryListFilter{})
	if len(items) != 0 {
		t.Errorf("expected library to stay empty, got %d items", len(items))
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

func TestSetPriorityForwardsToEngine(t *testing.T) {
	svc, _, _, e := newTestTorrentSvc()
	userID := uuid.New()
	session, _ := svc.Add(context.Background(), userID, validMagnet)

	if err := svc.SetPriority(context.Background(), userID, session.ID, 3, 2); err != nil {
		t.Fatalf("set priority: %v", err)
	}
	if len(e.priorityCalls) != 1 {
		t.Fatalf("expected 1 priority call, got %d", len(e.priorityCalls))
	}
	call := e.priorityCalls[0]
	if call.Hash != session.InfoHash || call.Idx != 3 || call.Prio != 2 {
		t.Errorf("unexpected call: %+v", call)
	}
}

func TestSetPriorityRejectsForeignSession(t *testing.T) {
	svc, _, _, _ := newTestTorrentSvc()
	owner := uuid.New()
	session, _ := svc.Add(context.Background(), owner, validMagnet)

	err := svc.SetPriority(context.Background(), uuid.New(), session.ID, 0, 1)
	var de *domain.Error
	if !errors.As(err, &de) || de.Code != domain.ErrNotFound {
		t.Fatalf("expected ErrNotFound for foreign user, got %v", err)
	}
}

func TestSetPriorityOnMissingSession(t *testing.T) {
	svc, _, _, _ := newTestTorrentSvc()
	err := svc.SetPriority(context.Background(), uuid.New(), uuid.New(), 0, 1)
	var de *domain.Error
	if !errors.As(err, &de) || de.Code != domain.ErrNotFound {
		t.Fatalf("expected ErrNotFound, got %v", err)
	}
}

func TestListReturnsOnlyCallerSessions(t *testing.T) {
	svc, _, _, _ := newTestTorrentSvc()
	owner := uuid.New()
	other := uuid.New()

	if _, err := svc.Add(context.Background(), owner, validMagnet); err != nil {
		t.Fatalf("owner add: %v", err)
	}
	otherMagnet := "magnet:?xt=urn:btih:abababababababababababababababababababab"
	if _, err := svc.Add(context.Background(), other, otherMagnet); err != nil {
		t.Fatalf("other add: %v", err)
	}

	sessions, err := svc.List(context.Background(), owner)
	if err != nil {
		t.Fatalf("list: %v", err)
	}
	if len(sessions) != 1 {
		t.Fatalf("expected 1 session for owner, got %d", len(sessions))
	}
	if sessions[0].UserID != owner {
		t.Errorf("list leaked cross-user session: %s", sessions[0].UserID)
	}
}

func TestDeleteRemovesSessionAndCallsEngine(t *testing.T) {
	svc, sr, _, e := newTestTorrentSvc()
	userID := uuid.New()
	session, _ := svc.Add(context.Background(), userID, validMagnet)

	if err := svc.Delete(context.Background(), userID, session.ID); err != nil {
		t.Fatalf("delete: %v", err)
	}
	if _, err := sr.GetByID(context.Background(), session.ID); err == nil {
		t.Fatal("session should be removed")
	}
	if len(e.removeCalls) != 1 || e.removeCalls[0] != session.InfoHash {
		t.Errorf("engine.Remove not called correctly: %+v", e.removeCalls)
	}
}

func TestDeleteRejectsForeignSession(t *testing.T) {
	svc, sr, _, _ := newTestTorrentSvc()
	owner := uuid.New()
	session, _ := svc.Add(context.Background(), owner, validMagnet)

	err := svc.Delete(context.Background(), uuid.New(), session.ID)
	var de *domain.Error
	if !errors.As(err, &de) || de.Code != domain.ErrNotFound {
		t.Fatalf("expected ErrNotFound for foreign user, got %v", err)
	}
	// Still present for the owner.
	if _, err := sr.GetByID(context.Background(), session.ID); err != nil {
		t.Errorf("foreign delete should not have removed the session: %v", err)
	}
}

func TestDeleteMissingSession(t *testing.T) {
	svc, _, _, _ := newTestTorrentSvc()
	err := svc.Delete(context.Background(), uuid.New(), uuid.New())
	var de *domain.Error
	if !errors.As(err, &de) || de.Code != domain.ErrNotFound {
		t.Fatalf("expected ErrNotFound, got %v", err)
	}
}

func TestAddRejectsOversizedMagnet(t *testing.T) {
	svc, _, _, _ := newTestTorrentSvc()
	huge := validMagnet + "&extra=" + strings.Repeat("x", 4096)
	_, err := svc.Add(context.Background(), uuid.New(), huge)
	var de *domain.Error
	if !errors.As(err, &de) || de.Code != domain.ErrInvalidInput {
		t.Fatalf("expected ErrInvalidInput for oversized magnet, got %v", err)
	}
}

func TestInfoHashFromMagnet(t *testing.T) {
	h, err := InfoHashFromMagnet("  magnet:?xt=urn:btih:ABCDEF0123456789ABCDEF0123456789ABCDEF01&dn=x  ")
	if err != nil {
		t.Fatalf("valid magnet: %v", err)
	}
	if h != "abcdef0123456789abcdef0123456789abcdef01" {
		t.Errorf("info hash not normalized: %q", h)
	}

	if _, err := InfoHashFromMagnet("not-a-magnet"); err == nil {
		t.Error("expected error for invalid magnet")
	}
}

func TestNormalizeFileTypeCoversAllBranches(t *testing.T) {
	cases := map[string]domain.FileType{
		"image":   domain.FileTypeImage,
		"PDF":     domain.FileTypePDF,
		"Epub":    domain.FileTypeEPUB,
		"cbz":     domain.FileTypeCBZ,
		"CBR":     domain.FileTypeCBR,
		"":        domain.FileTypeUnknown,
		"unknown": domain.FileTypeUnknown,
		"weird":   domain.FileTypeUnknown,
	}
	for in, want := range cases {
		if got := normalizeFileType(in); got != want {
			t.Errorf("normalizeFileType(%q) = %q, want %q", in, got, want)
		}
	}
}
