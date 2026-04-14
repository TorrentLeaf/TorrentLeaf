package service

import (
	"context"

	"github.com/google/uuid"
)

type ReaderService interface {
	GetPages(ctx context.Context, fileID uuid.UUID) ([]string, error)
}
