package service

import (
	"context"
	"errors"
	"testing"

	"github.com/google/uuid"

	"github.com/seuuser/torrentleaf/api/internal/domain"
)

func TestNaturalLessOrdersNumericFilenames(t *testing.T) {
	cases := []struct {
		a, b string
		want bool
	}{
		{"page1.jpg", "page2.jpg", true},
		{"page2.jpg", "page10.jpg", true},
		{"page10.jpg", "page2.jpg", false},
		{"ch01-p005.png", "ch01-p10.png", true},
		{"ch02-p001.png", "ch10-p001.png", true},
		{"a.jpg", "b.jpg", true},
	}
	for _, c := range cases {
		if got := naturalLess(c.a, c.b); got != c.want {
			t.Errorf("naturalLess(%q, %q) = %v, want %v", c.a, c.b, got, c.want)
		}
	}
}

func TestListPagesFiltersImagesAndSortsNaturally(t *testing.T) {
	sessions := newFakeTorrentRepo()
	files := newFakeFileRepo()
	svc := NewReaderService(sessions, files, nil)
	userID := uuid.New()

	session, err := sessions.Create(context.Background(), domain.TorrentSession{
		UserID:   userID,
		InfoHash: "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
	})
	if err != nil {
		t.Fatalf("create session: %v", err)
	}

	// Mixed: images with misordered filenames, plus one non-image that must be filtered.
	_ = files.CreateBatch(context.Background(), []domain.TorrentFile{
		{ID: uuid.New(), SessionID: session.ID, Index: 0, Name: "page-10.jpg", FileType: domain.FileTypeImage, MimeType: "image/jpeg"},
		{ID: uuid.New(), SessionID: session.ID, Index: 1, Name: "page-2.jpg", FileType: domain.FileTypeImage, MimeType: "image/jpeg"},
		{ID: uuid.New(), SessionID: session.ID, Index: 2, Name: "page-1.jpg", FileType: domain.FileTypeImage, MimeType: "image/jpeg"},
		{ID: uuid.New(), SessionID: session.ID, Index: 3, Name: "readme.txt", FileType: domain.FileTypeUnknown, MimeType: "text/plain"},
	})

	pages, err := svc.ListPages(context.Background(), userID, session.ID, uuid.Nil)
	if err != nil {
		t.Fatalf("list pages: %v", err)
	}
	if len(pages) != 3 {
		t.Fatalf("expected 3 image pages, got %d", len(pages))
	}
	want := []string{"page-1.jpg", "page-2.jpg", "page-10.jpg"}
	for i, p := range pages {
		if p.Name != want[i] {
			t.Errorf("pos %d: got %s, want %s", i, p.Name, want[i])
		}
		if p.Index != i {
			t.Errorf("pos %d: index not reassigned, got %d", i, p.Index)
		}
	}
}

func TestListPagesExpandsCbzEntries(t *testing.T) {
	sessions := newFakeTorrentRepo()
	files := newFakeFileRepo()
	engine := &fakeEngine{archiveEntries: map[string][]EngineArchiveEntry{}}
	svc := NewReaderService(sessions, files, engine)
	userID := uuid.New()
	hash := "eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"

	session, _ := sessions.Create(context.Background(), domain.TorrentSession{
		UserID:   userID,
		InfoHash: hash,
	})

	cbz1 := uuid.New()
	cbz2 := uuid.New()
	_ = files.CreateBatch(context.Background(), []domain.TorrentFile{
		{ID: cbz1, SessionID: session.ID, Index: 0, Name: "ch02.cbz", FileType: domain.FileTypeCBZ, MimeType: "application/vnd.comicbook+zip"},
		{ID: cbz2, SessionID: session.ID, Index: 1, Name: "ch01.cbz", FileType: domain.FileTypeCBZ, MimeType: "application/vnd.comicbook+zip"},
	})

	engine.archiveEntries[hash+":0"] = []EngineArchiveEntry{
		{Index: 0, Name: "p1.jpg", Size: 100, MimeType: "image/jpeg"},
		{Index: 1, Name: "p2.jpg", Size: 200, MimeType: "image/jpeg"},
	}
	engine.archiveEntries[hash+":1"] = []EngineArchiveEntry{
		{Index: 0, Name: "p1.jpg", Size: 300, MimeType: "image/jpeg"},
	}

	pages, err := svc.ListPages(context.Background(), userID, session.ID, uuid.Nil)
	if err != nil {
		t.Fatalf("list pages: %v", err)
	}
	if len(pages) != 3 {
		t.Fatalf("expected 3 pages (1 from ch01.cbz + 2 from ch02.cbz), got %d", len(pages))
	}
	// Files are natural-sorted, so ch01.cbz entries come first.
	if pages[0].FileID != cbz2 || *pages[0].EntryIndex != 0 {
		t.Errorf("page 0 should be ch01.cbz entry 0, got fileID=%s entryIdx=%v", pages[0].FileID, pages[0].EntryIndex)
	}
	if pages[1].FileID != cbz1 || *pages[1].EntryIndex != 0 {
		t.Errorf("page 1 should be ch02.cbz entry 0, got fileID=%s entryIdx=%v", pages[1].FileID, pages[1].EntryIndex)
	}
	if pages[2].FileID != cbz1 || *pages[2].EntryIndex != 1 {
		t.Errorf("page 2 should be ch02.cbz entry 1, got fileID=%s entryIdx=%v", pages[2].FileID, pages[2].EntryIndex)
	}
	for i, p := range pages {
		if p.Index != i {
			t.Errorf("pos %d: index not reassigned, got %d", i, p.Index)
		}
	}
}

func TestListPagesPropagatesArchiveError(t *testing.T) {
	sessions := newFakeTorrentRepo()
	files := newFakeFileRepo()
	engine := &fakeEngine{archiveErr: errors.New("engine down")}
	svc := NewReaderService(sessions, files, engine)
	userID := uuid.New()

	session, _ := sessions.Create(context.Background(), domain.TorrentSession{
		UserID:   userID,
		InfoHash: "ffffffffffffffffffffffffffffffffffffffff",
	})
	_ = files.CreateBatch(context.Background(), []domain.TorrentFile{
		{ID: uuid.New(), SessionID: session.ID, Index: 0, Name: "ch01.cbz", FileType: domain.FileTypeCBZ},
	})

	if _, err := svc.ListPages(context.Background(), userID, session.ID, uuid.Nil); err == nil {
		t.Fatal("expected archive error to propagate")
	}
}

func TestListPagesScopesByUser(t *testing.T) {
	sessions := newFakeTorrentRepo()
	files := newFakeFileRepo()
	svc := NewReaderService(sessions, files, nil)

	owner := uuid.New()
	session, _ := sessions.Create(context.Background(), domain.TorrentSession{
		UserID:   owner,
		InfoHash: "cccccccccccccccccccccccccccccccccccccccc",
	})
	_ = files.CreateBatch(context.Background(), []domain.TorrentFile{
		{ID: uuid.New(), SessionID: session.ID, Index: 0, Name: "a.jpg", FileType: domain.FileTypeImage},
	})

	_, err := svc.ListPages(context.Background(), uuid.New(), session.ID, uuid.Nil)
	if err == nil {
		t.Fatal("stranger should not list pages")
	}
}

func TestListPagesScopedToSingleFile(t *testing.T) {
	sessions := newFakeTorrentRepo()
	files := newFakeFileRepo()
	engine := &fakeEngine{archiveEntries: map[string][]EngineArchiveEntry{}}
	svc := NewReaderService(sessions, files, engine)
	userID := uuid.New()
	hash := "1111111111111111111111111111111111111111"

	session, _ := sessions.Create(context.Background(), domain.TorrentSession{UserID: userID, InfoHash: hash})
	wanted := uuid.New()
	other := uuid.New()
	_ = files.CreateBatch(context.Background(), []domain.TorrentFile{
		{ID: wanted, SessionID: session.ID, Index: 0, Name: "ch01.cbz", FileType: domain.FileTypeCBZ},
		{ID: other, SessionID: session.ID, Index: 1, Name: "ch02.cbz", FileType: domain.FileTypeCBZ},
	})
	engine.archiveEntries[hash+":0"] = []EngineArchiveEntry{{Index: 0, Name: "a.jpg", Size: 10, MimeType: "image/jpeg"}}
	engine.archiveEntries[hash+":1"] = []EngineArchiveEntry{{Index: 0, Name: "b.jpg", Size: 10, MimeType: "image/jpeg"}}

	pages, err := svc.ListPages(context.Background(), userID, session.ID, wanted)
	if err != nil {
		t.Fatalf("list pages: %v", err)
	}
	if len(pages) != 1 || pages[0].FileID != wanted {
		t.Fatalf("expected single page for wanted file, got %+v", pages)
	}
}

func TestListPagesArchiveNotReadyMapsToUnavailable(t *testing.T) {
	sessions := newFakeTorrentRepo()
	files := newFakeFileRepo()
	engine := &fakeEngine{archiveErr: ErrArchiveNotReady}
	svc := NewReaderService(sessions, files, engine)
	userID := uuid.New()

	session, _ := sessions.Create(context.Background(), domain.TorrentSession{
		UserID:   userID,
		InfoHash: "2222222222222222222222222222222222222222",
	})
	_ = files.CreateBatch(context.Background(), []domain.TorrentFile{
		{ID: uuid.New(), SessionID: session.ID, Index: 0, Name: "ch01.cbz", FileType: domain.FileTypeCBZ},
	})

	_, err := svc.ListPages(context.Background(), userID, session.ID, uuid.Nil)
	var de *domain.Error
	if !errors.As(err, &de) || de.Code != domain.ErrUnavailable {
		t.Fatalf("expected ErrUnavailable, got %v", err)
	}
}
