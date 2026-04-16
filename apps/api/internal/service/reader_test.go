package service

import (
	"context"
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
	svc := NewReaderService(sessions, files)
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

	pages, err := svc.ListPages(context.Background(), userID, session.ID)
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

func TestListPagesScopesByUser(t *testing.T) {
	sessions := newFakeTorrentRepo()
	files := newFakeFileRepo()
	svc := NewReaderService(sessions, files)

	owner := uuid.New()
	session, _ := sessions.Create(context.Background(), domain.TorrentSession{
		UserID:   owner,
		InfoHash: "cccccccccccccccccccccccccccccccccccccccc",
	})
	_ = files.CreateBatch(context.Background(), []domain.TorrentFile{
		{ID: uuid.New(), SessionID: session.ID, Index: 0, Name: "a.jpg", FileType: domain.FileTypeImage},
	})

	_, err := svc.ListPages(context.Background(), uuid.New(), session.ID)
	if err == nil {
		t.Fatal("stranger should not list pages")
	}
}
