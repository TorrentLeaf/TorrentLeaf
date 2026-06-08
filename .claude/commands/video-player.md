# /video-player — Add video playback support with Vidstack and MKV transmuxing

Use this command to add full video playback to TorrentLeaf, including MKV support.

## Prompt
Implement video playback support in TorrentLeaf using Vidstack for the player UI and
server-side transmuxing for MKV files.

**Context:** Video files are currently classified as `unknown` by the engine and have no
player component. The torrent engine already supports Range-request streaming which is
perfect for video. Users need to watch anime/movies with subtitle track support.

**Read before starting:**
- `.claude/agents/frontend.md`, `.claude/agents/backend.md`, `.claude/agents/torrent-engine.md`
- `CLAUDE.md` §5, §6.1, §7
- `apps/torrent-engine/src/streaming/streamer.ts` — existing Range-request streaming
- `apps/torrent-engine/src/files/detector.ts` — file type detection
- `apps/web/src/app/(app)/torrents/[id]/page.tsx` — `readerLinkFor()` function

**IMPORTANT:** This feature touches ALL three services. Follow AGENTS.md orchestration order:
types → engine → backend → frontend.

### Phase 1: Torrent Engine — Video detection & streaming

1. **File detection** (`apps/torrent-engine/src/files/detector.ts`):
   Add to `EXT_TO_TYPE`: `.mp4`→`video`, `.mkv`→`video`, `.avi`→`video`,
   `.webm`→`video`, `.mov`→`video`, `.flv`→`video`, `.m4v`→`video`
   Add to `EXT_TO_MIME`: `.mp4`→`video/mp4`, `.mkv`→`video/x-matroska`,
   `.avi`→`video/x-msvideo`, `.webm`→`video/webm`, `.mov`→`video/quicktime`,
   `.flv`→`video/x-flv`, `.m4v`→`video/mp4`
   Add `'video'` to the `FileType` union in `torrent/types.ts`

2. **Streaming** — the existing `streamer.ts` already handles Range requests for any file.
   Video streaming works out of the box. No changes needed here.

3. **MKV transmuxing endpoint** — Create `apps/torrent-engine/src/api/routes/transmux.ts`:
   - New route: `GET /engine/transmux/:infoHash/:fileIndex`
   - Uses `ffmpeg` (via `fluent-ffmpeg`) to remux MKV → fMP4 on-the-fly
   - Streams the output directly to the HTTP response
   - ffmpeg must be installed in the engine Docker image (add to Dockerfile)
   - Args: `-i pipe:0 -c copy -movflags frag_keyframe+empty_moov -f mp4 pipe:1`
     (copy streams, no re-encoding, fragmented MP4 for streaming)
   - Fallback: if ffmpeg fails, return 415 Unsupported Media Type
   - Add `fluent-ffmpeg` and `@types/fluent-ffmpeg` to engine deps

4. **Subtitle extraction endpoint** — Create `apps/torrent-engine/src/api/routes/subtitles.ts`:
   - `GET /engine/subtitles/:infoHash/:fileIndex` — list embedded subtitle tracks (via ffprobe)
   - `GET /engine/subtitles/:infoHash/:fileIndex/:trackIndex` — extract a specific subtitle
     track as VTT (ffmpeg `-map 0:s:N -f webvtt pipe:1`)

5. **Update engine Dockerfile** to include ffmpeg:
   ```dockerfile
   RUN apk add --no-cache ffmpeg
   ```

### Phase 2: Backend — Domain & API proxy

6. Add `FileTypeVideo FileType = "video"` to `apps/api/internal/domain/torrent.go`
7. Update `normalizeFileType()` in `torrent_impl.go` to handle `"video"`
8. Add proxy routes for video-specific engine endpoints:
   - `GET /api/v1/stream/:fileId/transmux` → proxy to engine transmux
   - `GET /api/v1/stream/:fileId/subtitles` → proxy to engine subtitles list
   - `GET /api/v1/stream/:fileId/subtitles/:trackIndex` → proxy to engine subtitle extract

### Phase 3: Frontend — Video player component

9. Install `@vidstack/react` in apps/web:
   `pnpm --filter @torrentleaf/web add @vidstack/react`

10. Create `apps/web/src/components/reader/VideoPlayer.tsx`:
    - Use Vidstack's `<MediaPlayer>` + `<MediaProvider>` components
    - Source URL: use the stream URL for MP4/WebM, transmux URL for MKV
    - Auto-detect if transmuxing is needed based on file MIME type
    - **Controls**: play/pause, seek bar, volume, playback speed, fullscreen, PiP
    - **Subtitle tracks**: fetch available tracks from subtitle endpoint, render as
      `<Track>` elements in Vidstack
    - **Audio tracks**: if multiple audio streams, show audio track selector
    - Dark theme matching TorrentLeaf design system
    - Keyboard shortcuts: space (play/pause), arrows (seek), F (fullscreen), M (mute)
    - Remember playback position using `useReadingProgress` hook (reuse existing
      progress infrastructure — store current time in `currentPage` field as seconds)

11. Create route `apps/web/src/app/(app)/watch/[fileId]/page.tsx`:
    - Render `<VideoPlayer>` with fileId from params
    - Fetch file info to get the file name for the title

12. Update `readerLinkFor()` in torrent detail page:
    - `if (file.fileType === 'video') return \`/watch/\${encodeURIComponent(file.id)}\``

13. Add `Video` (lucide-react) icon to the files list for video file types

### Phase 4: Tests & validation
14. Engine: test that video files are detected correctly
15. Backend: test proxy routes
16. Frontend: Vitest test for VideoPlayer component mount
17. Manual test: add a torrent with an MP4 file, verify playback
18. Manual test: add a torrent with an MKV file, verify transmux + playback
19. Run `make test`

**All UI strings in English.**
