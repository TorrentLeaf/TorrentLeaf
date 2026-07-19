package domain

import (
	"time"

	"github.com/google/uuid"
)

type TorrentStatus string

const (
	StatusFetchingMetadata TorrentStatus = "fetching_metadata"
	StatusDownloading      TorrentStatus = "downloading"
	StatusSeeding          TorrentStatus = "seeding"
	StatusPaused           TorrentStatus = "paused"
	StatusError            TorrentStatus = "error"
	StatusEvicted          TorrentStatus = "evicted"
)

type FileType string

const (
	FileTypeImage    FileType = "image"
	FileTypePDF      FileType = "pdf"
	FileTypeEPUB     FileType = "epub"
	FileTypeCBZ      FileType = "cbz"
	FileTypeCBR      FileType = "cbr"
	FileTypeVideo    FileType = "video"
	FileTypeUnknown  FileType = "unknown"
)

type TorrentSession struct {
	ID              uuid.UUID
	UserID          uuid.UUID
	InfoHash        string
	MagnetURI       string
	Name            string
	Status          TorrentStatus
	TotalSize       int64
	DownloadedBytes int64
	PeersCount      int
	DownloadSpeed   float64
	UploadSpeed     float64
	Files           []TorrentFile
	CreatedAt       time.Time
	UpdatedAt       time.Time
	LastTouchedAt   time.Time `json:"lastTouchedAt"`
}

type TorrentFile struct {
	ID              uuid.UUID
	SessionID       uuid.UUID
	Index           int
	Name            string
	Path            string
	Length          int64
	MimeType        string
	FileType        FileType
	Priority        int
	DownloadedBytes int64
}

type ReadingMode string

const (
	ReadingModePaginated  ReadingMode = "paginated"
	ReadingModeWebtoon    ReadingMode = "webtoon"
	ReadingModeDoublePage ReadingMode = "double-page"
)

type ReadingProgress struct {
	ID          uuid.UUID
	UserID      uuid.UUID
	FileID      uuid.UUID
	CurrentPage int
	TotalPages  int
	ReadingMode ReadingMode
	// Location is a free-form position marker used by readers that don't
	// page-index naturally (EPUB uses a CFI string). Empty for image/pdf.
	Location   string
	LastReadAt time.Time
}

type LibraryItemType string

const (
	LibraryTypeManga    LibraryItemType = "manga"
	LibraryTypeBook     LibraryItemType = "book"
	LibraryTypeDocument LibraryItemType = "document"
	LibraryTypeVideo    LibraryItemType = "video"
	LibraryTypeOther    LibraryItemType = "other"
)

type LibraryItem struct {
	ID         uuid.UUID
	UserID     uuid.UUID
	SessionID  uuid.UUID
	Title      string
	CoverURL   string
	Type       LibraryItemType
	AddedAt    time.Time
	LastReadAt *time.Time
}
