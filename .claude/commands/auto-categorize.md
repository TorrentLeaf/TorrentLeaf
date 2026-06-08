# /auto-categorize — Implement auto-categorization of library items

Use this command to fix content categorization so torrents are properly classified
as Manga, Book, Document, Video, or Other.

## Prompt
Fix the auto-categorization of library items in TorrentLeaf.

**Context:** Currently, every torrent added to the library is hardcoded as `type: 'other'`
(see `apps/api/internal/service/torrent_impl.go:88`). The engine already classifies individual
files correctly (image, pdf, epub, cbz, cbr) but this info is never used to set the library
item's `content_type`. Video files are not detected at all.

**Read before starting:**
- `.claude/agents/backend.md`
- `CLAUDE.md` §7 (domain entities)
- `apps/api/internal/service/torrent_impl.go` — `ApplyMetadata()` method
- `apps/api/internal/domain/torrent.go` — domain types
- `apps/torrent-engine/src/files/detector.ts` — file type detection

**Tasks:**

### Backend (apps/api)
1. Add `FileTypeVideo FileType = "video"` and `LibraryTypeVideo LibraryItemType = "video"` to domain types
2. Update `normalizeFileType()` to handle `"video"` string
3. In `ApplyMetadata()`, after creating files, infer the library item type from the
   **dominant file type** among the torrent's files:
   - Majority `image`, `cbz`, `cbr` → `manga`
   - Majority `epub` → `book`
   - Majority `pdf` → `document`
   - Majority `video` → `video`
   - Mixed or unrecognized → `other`
4. Call `s.library.UpdateTypeBySession(ctx, session.ID, inferredType)` (create this
   repository method if it doesn't exist)
5. Write unit tests for the inference logic

### Torrent Engine (apps/torrent-engine)
6. Add video extensions to `detector.ts`:
   `.mp4`, `.mkv`, `.avi`, `.webm`, `.mov`, `.flv`, `.wmv`, `.m4v`
   with MIME types `video/mp4`, `video/x-matroska`, `video/x-msvideo`,
   `video/webm`, `video/quicktime`, etc.
7. Add `'video'` to the `FileType` union in `torrent/types.ts`

### Frontend (apps/web)
8. Add `'video'` to `LibraryItemType` in `lib/library.ts`
9. Update the filter list in the library page to include a "Video" filter
10. Add a `Video` icon import from lucide-react for the video type in `TorrentCard`
11. Add `{ value: 'video', label: 'Video' }` to the FILTERS array

### Migration
12. Create migration `004_video_type.up.sql` that:
    - Adds `'video'` as a valid value for `content_type` in `library_items` if using CHECK constraint
    - Adds `'video'` as a valid value for `file_type` in `torrent_files` if using CHECK constraint
    (Note: these are VARCHAR columns without CHECK constraints, so migration may just be a no-op
    documentation marker. Verify the schema first.)

13. Run `make test-api` and `make test-web` to validate.
