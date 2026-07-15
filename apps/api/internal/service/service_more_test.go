package service

import (
	"context"
	"errors"
	"testing"

	"github.com/google/uuid"

	"github.com/Dellareti/torrentleaf/api/internal/domain"
)

func TestNormalizeFileTypeWithName(t *testing.T) {
	cases := map[string]domain.FileType{
		"movie.mkv":   domain.FileTypeVideo,
		"clip.MP4":    domain.FileTypeVideo,
		"a.webm":      domain.FileTypeVideo,
		"page.jpg":    domain.FileTypeImage,
		"p.PNG":       domain.FileTypeImage,
		"doc.pdf":     domain.FileTypePDF,
		"book.epub":   domain.FileTypeEPUB,
		"ch01.cbz":    domain.FileTypeCBZ,
		"stuff.zip":   domain.FileTypeCBZ,
		"ch01.cbr":    domain.FileTypeCBR,
		"stuff.rar":   domain.FileTypeCBR,
		"stuff.7z":    domain.FileTypeCBR,
		"readme.txt":  domain.FileTypeUnknown,
		"noext":       domain.FileTypeUnknown,
	}
	for name, want := range cases {
		if got := normalizeFileTypeWithName("", name); got != want {
			t.Fatalf("normalizeFileTypeWithName(%q) = %q, want %q", name, got, want)
		}
	}
	// An explicit engine type takes precedence over the extension guess.
	if got := normalizeFileTypeWithName("pdf", "whatever.mkv"); got != domain.FileTypePDF {
		t.Fatalf("explicit type should win, got %q", got)
	}
}

func TestSettingsService_Get(t *testing.T) {
	svc := NewSettingsService(newFakeSettingsRepo())
	s, err := svc.Get(context.Background(), uuid.New())
	if err != nil {
		t.Fatalf("Get: %v", err)
	}
	// The fake mirrors the DB defaults (AutoAddLibrary defaults to true).
	if !s.AutoAddLibrary {
		t.Fatalf("expected default AutoAddLibrary=true, got %+v", s)
	}
}

func TestAddFromFile_CreatesSession(t *testing.T) {
	svc, sr, _, _ := newTestTorrentSvc()
	session, err := svc.AddFromFile(context.Background(), uuid.New(), []byte("d4:infod...e"))
	if err != nil {
		t.Fatalf("AddFromFile: %v", err)
	}
	if session.InfoHash != "0123456789abcdef0123456789abcdef01234567" {
		t.Fatalf("unexpected infoHash %q", session.InfoHash)
	}
	if len(sr.sessions) == 0 {
		t.Fatal("session was not persisted")
	}
}

func TestAddFromFile_EmptyRejected(t *testing.T) {
	svc, _, _, _ := newTestTorrentSvc()
	_, err := svc.AddFromFile(context.Background(), uuid.New(), nil)
	var de *domain.Error
	if err == nil || !errors.As(err, &de) || de.Code != domain.ErrInvalidInput {
		t.Fatalf("empty file should be ErrInvalidInput, got %v", err)
	}
}

func TestList_OverlaysLiveEngineState(t *testing.T) {
	svc, sr, _, e := newTestTorrentSvc()
	userID := uuid.New()
	sess, err := svc.Add(context.Background(), userID, validMagnet)
	if err != nil {
		t.Fatalf("add: %v", err)
	}
	// Engine reports live progress for that infoHash.
	e.liveList = []EngineTorrentStatus{{
		InfoHash: sess.InfoHash, Progress: 1, Peers: 12, Downloaded: 999, Length: 1000,
		DownloadSpeed: 100, UploadSpeed: 50,
	}}
	_ = sr // sessions already persisted by Add

	list, err := svc.List(context.Background(), userID)
	if err != nil {
		t.Fatalf("List: %v", err)
	}
	if len(list) != 1 {
		t.Fatalf("want 1 session, got %d", len(list))
	}
	got := list[0]
	if got.PeersCount != 12 || got.DownloadedBytes != 999 || got.TotalSize != 1000 {
		t.Fatalf("live state not overlaid: %+v", got)
	}
	if got.Status != domain.StatusSeeding {
		t.Fatalf("progress=1 should map to seeding, got %s", got.Status)
	}
}
