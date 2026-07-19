# TorrentLeaf — Finalization Design

> Design spec for closing the gap between the current mocked/broken state and a
> working product. Approved 2026-07-13. Language: internal doc in PT-BR is
> allowed (CLAUDE.md §6.1); all user-facing UI strings stay in English.

## 1. Context & Problem

Manual testing surfaced a set of critical bugs and half-mocked UI:

- **Add torrent fails with a "503"** in the UI. Root cause confirmed by
  reproducing directly against the engine:
  `POST /engine/torrents` → `400 {"error":"not enough free disk space
  (2.5 GB free, minimum 5 GB)"}`. The host disk is 99% full (2.6 GB free).
  The Go API then collapses **any** engine error into a generic
  `503 "torrent engine unavailable"` (`torrent_impl.go:84`), so the real
  reason never reaches the user.
- **Download path never leaves Docker.** The engine receives the per-user
  `downloadPath` but the container only mounts the named volume
  `torrent_data:/data/torrents`; there is no host bind-mount, and the disk
  guard always `statfs`-checks the fixed container path. The setting cannot
  currently place files on the host.
- **Dark/light theme toggle is decorative.** It is a local `useState(true)`
  (`app-page-shell.tsx:24`, `library/page.tsx:40`) never connected to any CSS
  class or `documentElement`. The app is CSS-hardcoded dark; the toggle does
  nothing.
- **Sidebar "Library" (Manga / PDFs / EPUBs / More) is hardcoded**
  (`sidebar.tsx` `LIBRARY` array), links nowhere, and does not reflect the
  content the user actually has.
- **Notifications toggle** is likewise decorative — there is no notification
  system behind it.
- **Missing add flows:** no `.torrent` file upload and no magnet-link
  protocol handler; the user must copy/paste magnet text.
- **Reseed at startup logs `added 0, skipped 0, failed 16/16`** — almost
  certainly the same disk guard cascading through every re-add, reported as a
  single opaque count.

### Approved product decisions (2026-07-13)

1. **Theme:** implement a real light theme (full `next-themes` integration),
   not remove the toggle.
2. **Download path:** bind-mount a real host folder; per-user path is a
   subfolder under it.
3. **Disk:** fix the error transparency **and** clean Docker to unblock dev.
4. **Sidebar Library:** filter by **file format** derived from actual files —
   not an unreliable "manga vs book" guess.
5. **Notifications toggle:** remove for now.
6. **Add torrent:** support both `.torrent` file upload **and** a magnet
   protocol handler.

## 2. Goals / Non-Goals

**Goals**
- Adding a torrent (magnet or `.torrent`) works and fails with a truthful,
  actionable message when it can't.
- The download-path setting places files on the host filesystem, safely.
- The theme toggle really switches light/dark and persists.
- The sidebar Library reflects real, format-derived content with working
  filters.
- No decorative/mocked controls remain in the shipped sidebar.

**Non-Goals**
- No metadata provider / cover art / "manga vs book" classification.
- No real notification/event system (only the toggle removal is in scope).
- No arbitrary absolute host paths from the settings UI (security); users pick
  a subfolder under the mounted base dir.
- No auth/admin/seeding-metrics rework beyond what the workstreams touch.

## 3. Design rationale — sidebar Library by format

Mature comic/book/media servers (**Kavita, Komga, Jellyfin**) never
auto-detect "manga vs book". The library *type* is either **declared by the
user at library creation** or supplied by a **metadata provider**. TorrentLeaf
has neither, so inferring "Manga" from a file is unreliable — the exact concern
raised in review.

What *is* reliable is the **file format**, already persisted in
`torrent_files.file_type` (`image | pdf | epub | cbz | cbr | video | unknown`).
So the sidebar becomes **format-derived groups** with real counts that filter
`/library`:

| Group      | Derived from `file_type`      | Reader route |
|------------|-------------------------------|--------------|
| Comics     | `image`, `cbz`, `cbr`         | manga reader |
| Books      | `epub`                        | epub reader  |
| PDFs       | `pdf`                         | pdf reader   |
| Video      | `video`                       | video player |
| Other      | `unknown` / mixed / no files  | —            |

A library item (torrent session) can hold multiple files; its group is the
**dominant** file type (most files by count; ties resolved by the priority
order Comics > Books > PDFs > Video > Other; items with no classified files →
Other). This grouping already matches the reader-routing the app performs.

## 4. Workstreams

Each workstream is independently shippable, separately committed, and tested.
Execution order: **WS0 → WS1 → WS8 → WS2 → WS3 → WS4 → WS6 → WS7 → WS5.**

### WS0 · Unblock dev disk (ops, no code)
Prune Docker (`docker system prune` on the ~5.2 GB reclaimable images + build
cache), confirm `df -h /` shows > 5 GB free so the engine guard passes. Record
before/after. This is dev-environment only; production sizing is unchanged.

### WS1 · Add-torrent error transparency (engine + API)
- **Engine:** the add path returns a machine-readable `code` alongside the
  message. Guard failure → `{ error, code: "insufficient_disk" }`; invalid
  magnet → `code: "invalid_magnet"`. HTTP stays 400/appropriate but the body
  carries `code`.
- **API (`engine_client.go` + `torrent_impl.go`):** parse the engine's error
  body; map to correct domain errors instead of blanket `ErrUnavailable`:
  - connection/transport failure (`resp` error, timeout) → `503`
    `"torrent engine unavailable"` (unchanged).
  - engine `insufficient_disk` → `507 Insufficient Storage`, message surfaced
    (e.g. "not enough free disk space to add this torrent").
  - engine `invalid_magnet` / other 4xx → `422` with the engine's reason.
- **Web:** the Add page / MagnetInput shows the real message on failure.
- **Tests:** Go service test with a fake `EngineClient` returning each error
  code asserts the mapped status + message; engine unit test for the guard's
  `code`. Ensure internal URLs/paths are never leaked (CLAUDE.md §10).

### WS8 · Reseed resilience (verification-led)
After WS0/WS1, restart the API and confirm reseed recovers (`added N`). Change
`ReseedEngine` to log a **per-torrent** outcome (hash + reason) instead of only
the aggregate `failed N/M`, reusing the WS1 error codes so a disk-full reseed is
legible. Keep it best-effort (CLAUDE.md §14). Small code, mostly verification.

### WS2 · Download path reaches the host (bind-mount)
- **Compose:** replace the engine's `torrent_data:/data/torrents` named volume
  with a host bind-mount driven by env: `TORRENTLEAF_DATA_DIR` (default
  `./data/torrents`) → `/data/torrents`. Update `docker-compose.yml`,
  `docker-compose.dev.yml`, `docker-compose.prod.yml`, `.env.example`.
- **Engine path safety:** resolve the per-user `downloadPath` as a **subpath
  under `TORRENT_DOWNLOAD_PATH`**. Reject absolute paths and any `..`
  traversal; `path.resolve` must stay inside the base dir or the request is
  rejected. `mkdir -p` the resolved dir. The disk guard `statfs`-checks the
  resolved path.
- **Settings:** the download-path setting is a **relative subfolder name**,
  validated (no leading `/`, no `..`, allowed charset). Settings UI copy
  updated to explain it is a subfolder under the server's data dir. Backend
  validation in the settings service (Zod-equivalent / Go validator).
- **ADR:** `docs/adr/006-download-path-bind-mount.md` — why bind-mount, why
  subpath-only (security), and the host-filesystem trade-off.
- **Tests:** engine unit tests for path resolution (valid subpath ok; absolute
  and `..` rejected); settings validation test.

### WS3 · `.torrent` file upload
- **Engine:** `POST /engine/torrents/file` accepts the raw `.torrent` bytes
  (via `@fastify/multipart` or raw body), calls WebTorrent `add(Buffer, …)`,
  and returns the same status shape (`infoHash`, `name`, …) as the magnet add.
  Same disk guard applies. Max size limit + content sniff.
- **API:** `POST /api/v1/torrents/file` (multipart, authenticated) forwards the
  bytes to the engine, then reuses the magnet session-creation flow — using the
  `infoHash`/name from the engine response (idempotent per user via
  `GetByUserAndInfoHash`, auto-shelf gated by `AutoAddLibrary`, same rollback
  on failure). Documented in CLAUDE.md route list.
- **Web:** Add page gains a drop zone + file picker for `.torrent`; on success,
  same redirect to `/torrents/:id` as the magnet flow.
- **Tests:** engine route test with a small fixture `.torrent`; API handler
  test asserting session/library creation and error propagation.

### WS4 · Magnet-link protocol handler
- **Web `/add`:** read a `?magnet=` query param; prefill the input and show a
  confirm step (never silently auto-submit — the user accepts). A button on
  Add (and Settings) calls
  `navigator.registerProtocolHandler('magnet', '<origin>/add?magnet=%s')`,
  with graceful handling where the API is unavailable/unsupported.
- **Tests:** component test that `/add?magnet=…` prefills and the confirm
  action calls the add mutation.

### WS5 · Real light theme (largest; done last)
- Add `next-themes` `ThemeProvider` (attribute `class`, default `dark`,
  `enableSystem` optional). Split the CSS variables in the global stylesheet
  into a **light** token set (`:root`) and **dark** token set (`.dark`),
  preserving the existing dark palette (CLAUDE.md §6) as the dark values and
  introducing a coherent light palette.
- Wire the sidebar toggle **and** a Settings control to `setTheme`; drop the
  local `useState` theme booleans in `app-page-shell.tsx` and
  `library/page.tsx`. Persistence via `next-themes` (localStorage) + no-flash
  script.
- **Reader backgrounds** (`readerBackground` etc.) remain independent per-reader
  UX settings; only the app chrome follows the theme.
- Update CLAUDE.md §6 note: dark is the **default**, light is **supported**.
- **Tests:** toggling flips the `html` `class` and persists across reload
  (component/integration test).

### WS6 · Sidebar Library = real format filters
- **API:** `GET /library` returns a derived `format` field per item
  (dominant `file_type` per §3). Implemented in the library service by joining
  `torrent_files`; no schema migration required (`file_type` already exists).
- **Web:** the sidebar `LIBRARY` section renders the five format groups with
  **real counts**, each clickable to filter `/library` by format. `/library`
  gains a `format` filter dimension alongside the existing status filter.
  Removes the hardcoded Manga/PDFs/EPUBs/More entries.
- **Tests:** library service format-derivation test (dominant-type + tie +
  empty cases); sidebar renders correct counts from a fixture.

### WS7 · Remove Notifications toggle
Remove the toggle and its plumbing from `sidebar.tsx`, `app-page-shell.tsx`,
`app-shell.tsx`, `dashboard-shell.tsx`, `library/page.tsx`, and any `notifications`
state/props. Pure deletion; verify no dangling props.

## 5. Cross-cutting constraints

- Run `make lint` and `make test` before considering each workstream done
  (CLAUDE.md §10).
- Commits **must not** carry a `Co-Authored-By: Claude` trailer (project memory).
- After editing the engine or API, `docker restart torrentleaf-engine` /
  `torrentleaf-api` (engine loses in-memory torrents on reload; stream 404s
  until API restart — project memory). After web route/config/env changes,
  `docker restart torrentleaf-web`.
- One commit per workstream so the user can review incrementally.
- Engine `archive.test.ts` + `tsc` are known-failing on the host (node-unrar-js
  only in the image) — not a regression (project memory); run engine tests in
  the container.
- All user-facing strings in English (CLAUDE.md §6.1). No internal
  infra errors leaked in API responses (CLAUDE.md §10).

## 6. Risks & mitigations

- **Light theme regressions across many components** — biggest surface; done
  last, behind a token split so most components inherit correctly. Manual pass
  over readers, dashboard, marketing.
- **Bind-mount permissions** on the host dir (container UID vs host UID) — call
  out in the ADR and `.env.example`; default to a repo-local `./data/torrents`.
- **`.torrent` parsing / large uploads** — enforce a size cap and validate the
  bencode before handing to WebTorrent.
- **Path traversal** in download path — the subpath resolver is the security
  boundary; covered by explicit unit tests.

## 7. Test strategy summary

Per workstream, as listed: Go service/handler tests (error mapping, `.torrent`
handler, library format derivation), engine Vitest unit/route tests (guard code,
path resolver, `.torrent` route), and web component tests (`/add` prefill, theme
toggle, sidebar counts). Green `make lint` + `make test` gate each commit.
