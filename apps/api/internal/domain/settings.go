package domain

import (
	"time"

	"github.com/google/uuid"
)

type UserSettings struct {
	ID                 uuid.UUID
	UserID             uuid.UUID
	DownloadPath       string
	DefaultReadingMode string
	DefaultFitMode     string
	ReadingDirection   string
	AutoAddLibrary     bool
	ReaderBackground   string
	CreatedAt          time.Time
	UpdatedAt          time.Time
}
