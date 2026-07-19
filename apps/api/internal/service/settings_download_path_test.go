package service

import (
	"context"
	"errors"
	"testing"

	"github.com/google/uuid"

	"github.com/Dellareti/torrentleaf/api/internal/domain"
)

func TestSettingsUpdate_RejectsUnsafeDownloadPath(t *testing.T) {
	svc := NewSettingsService(newFakeSettingsRepo())
	ctx := context.Background()

	bad := []string{"/etc", "../escape", "a/../../b", "  /abs  "}
	for _, p := range bad {
		p := p
		_, err := svc.Update(ctx, uuid.New(), SettingsUpdate{DownloadPath: &p})
		var de *domain.Error
		if err == nil || !errors.As(err, &de) || de.Code != domain.ErrInvalidInput {
			t.Fatalf("path %q should be rejected as invalid input, got %v", p, err)
		}
	}

	ok := "manga/one-piece"
	got, err := svc.Update(ctx, uuid.New(), SettingsUpdate{DownloadPath: &ok})
	if err != nil {
		t.Fatalf("valid subpath %q rejected: %v", ok, err)
	}
	if got.DownloadPath != ok {
		t.Fatalf("want DownloadPath %q, got %q", ok, got.DownloadPath)
	}
}
