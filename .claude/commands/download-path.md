# /download-path — Configurable download paths per user

Use this command to make torrent download paths configurable through user settings.

## Prompt
Implement configurable download paths in TorrentLeaf so users can choose where torrents
are downloaded on disk.

**Context:** Currently the torrent engine uses a hardcoded `TORRENT_DOWNLOAD_PATH=/data/torrents`
for all downloads. This needs to become per-user configurable via the settings page.

**Prerequisites:** The `/settings-page` command MUST have been run first — this feature depends
on the `user_settings` table and settings API.

**Read before starting:**
- `.claude/agents/backend.md`, `.claude/agents/torrent-engine.md`, `.claude/agents/frontend.md`
- `CLAUDE.md` §5, §11 (env vars)
- `apps/api/internal/service/torrent_impl.go` — `Add()` method
- `apps/api/internal/service/engine_client.go` — HTTP client to engine
- `apps/torrent-engine/src/torrent/engine.ts` — `add()` method
- `apps/torrent-engine/src/config.ts` — current config

**Implementation order:** engine → backend → frontend

### Phase 1: Torrent Engine — Per-torrent download path

1. Update `engine.add()` in `apps/torrent-engine/src/torrent/engine.ts` to accept an
   optional `downloadPath` parameter:
   ```typescript
   add(magnetURI: string, downloadPath?: string): WTTorrent {
     // ...
     torrent = this.client.add(magnetURI, {
       path: downloadPath ?? config.downloadPath,
       maxConns: config.maxConnsPerTorrent,
     })
   }
   ```

2. Update the engine's `POST /engine/torrents` route to accept a `downloadPath` field
   in the request body and pass it to `engine.add()`.

3. Add path validation:
   - Must be an absolute path
   - Must not contain `..` (path traversal)
   - Must be within an allowed base directory (env: `ALLOWED_DOWNLOAD_ROOTS`,
     default: `/data/torrents,/downloads`). Reject paths outside these roots.

### Phase 2: Backend — Pass download path from settings to engine

4. When `torrentService.Add()` is called, fetch the user's `download_path` from
   `user_settings` and pass it to the engine client:
   ```go
   settings, _ := s.settingsRepo.GetByUserID(ctx, userID)
   downloadPath := settings.DownloadPath // defaults to "/data/torrents"
   _, err := s.engine.Add(ctx, magnetURI, downloadPath)
   ```

5. Update `EngineClient.Add()` in `service/engine_client.go` to include `downloadPath`
   in the POST body to the engine.

6. Add validation in the settings handler: the download path must be a valid absolute path.

### Phase 3: Frontend — Download path UI

7. The settings page (created by `/settings-page`) already has a "Download path" field.
   Ensure it:
   - Shows the current path with a text input
   - Validates that it starts with `/`
   - Shows a help text: "Absolute path on the server where torrents will be downloaded.
     Must be within the Docker volume mount."
   - Shows disk usage if available (nice-to-have: add a `GET /api/v1/settings/disk-usage`
     endpoint that runs `du -sh` on the download path)

### Phase 4: Docker volume mapping

8. Update `docker-compose.dev.yml`:
   - Add a second volume mount for a common `/downloads` directory
   - Document in comments that custom download paths must be within mounted volumes

### Phase 5: Tests
9. Engine: test path validation (reject traversal, reject non-absolute)
10. Backend: test that settings download_path is passed to engine
11. Run `make test`

**All UI strings in English.**
