# TorrentLeaf API

Base URL (dev): `http://localhost:8080`
All routes are prefixed with `/api/v1` unless noted otherwise.

Authentication uses JWT bearer tokens. Protected endpoints require:

```
Authorization: Bearer <accessToken>
```

Access tokens expire after `JWT_ACCESS_TTL` (default `15m`). Refresh tokens
expire after `JWT_REFRESH_TTL` (default `168h` / 7 days). Logout is stateless
on the server — the client discards tokens.

---

## Auth

### `POST /api/v1/auth/register`

Create a new user account. Public.

**Request**

```json
{
  "username": "alice",
  "email": "alice@example.com",
  "password": "at-least-8-chars"
}
```

Constraints:
- `username`: 3–50 characters (trimmed)
- `email`: must contain `@`, max 255 chars, stored lowercased
- `password`: min 8 characters, hashed with bcrypt

**Responses**

- `201 Created`
  ```json
  {
    "id": "uuid",
    "username": "alice",
    "email": "alice@example.com",
    "role": "user"
  }
  ```
- `422 Unprocessable Entity` — validation failed
- `409 Conflict` — email or username already in use
- `400 Bad Request` — malformed JSON body

---

### `POST /api/v1/auth/login`

Exchange credentials for an access + refresh token pair. Public.

**Request**

```json
{
  "email": "alice@example.com",
  "password": "at-least-8-chars"
}
```

**Responses**

- `200 OK`
  ```json
  {
    "accessToken": "<jwt>",
    "refreshToken": "<jwt>",
    "user": {
      "id": "uuid",
      "username": "alice",
      "email": "alice@example.com",
      "role": "user"
    }
  }
  ```
- `401 Unauthorized` — invalid credentials (same response for unknown email
  and wrong password to avoid user enumeration)
- `400 Bad Request` — malformed JSON body

---

### `POST /api/v1/auth/refresh`

Exchange a valid refresh token for a fresh access token. Public.

**Request**

```json
{ "refreshToken": "<jwt>" }
```

**Responses**

- `200 OK`
  ```json
  { "accessToken": "<jwt>" }
  ```
- `401 Unauthorized` — token is expired, malformed, signed with an unexpected
  algorithm, of type `access` instead of `refresh`, or references a user that
  no longer exists
- `400 Bad Request` — missing `refreshToken`

---

### `POST /api/v1/auth/logout`

Stateless logout — the client is expected to drop both tokens. Public.

**Response**

- `204 No Content`

> A Redis-backed token blocklist can be added later if revoke-on-logout
> semantics become necessary.

---

## Authentication middleware

All routes under `/api/v1` that are not in the `Auth` section above require a
valid access token. The middleware:

1. Expects `Authorization: Bearer <token>`.
2. Validates the signature with `JWT_SECRET` (HS256 only).
3. Rejects tokens whose `typ` claim is not `access`.
4. Injects the user id and role into the request context (available via the
   `middleware.UserID(c)` helper in Go handlers).

Admin-only routes chain `middleware.RequireAdmin()` on top and require the
user to have `role = "admin"`.

**Common error responses**

- `401 Unauthorized` — missing, malformed, or expired token
- `403 Forbidden` — authenticated but lacks the required role

---

## Torrents

All torrent endpoints require authentication.

### `POST /api/v1/torrents`

Ingest a new torrent from a magnet URI. The API creates a `torrent_sessions`
row with status `fetching_metadata` and hands the magnet off to the
torrent-engine. The engine later calls back on
`POST /internal/torrents/:infoHash/metadata` with the file list, and the
session transitions to `downloading`.

If the authenticated user has already added this info hash, the existing
session is returned (idempotent). If a different user owns it, responds with
`409 Conflict`.

**Request**

```json
{ "magnetURI": "magnet:?xt=urn:btih:<40-hex>..." }
```

**Responses**

- `201 Created` — `torrentSessionDTO` (see shape below)
- `422 Unprocessable Entity` — magnet fails regex validation
- `409 Conflict` — hash already owned by a different user
- `500 Internal Server Error` — engine unreachable (DB row is rolled back)

### `GET /api/v1/torrents`

List the authenticated user's torrents, newest first. Returns an array of
`torrentSessionDTO` (without the `files` array).

### `GET /api/v1/torrents/:id`

Fetch a single session, including its `files` array.

- `200 OK` — `torrentSessionDTO`
- `404 Not Found` — id does not exist or is owned by another user

### `DELETE /api/v1/torrents/:id`

Remove the session from the DB and best-effort tell the engine to drop it.

- `204 No Content`
- `404 Not Found`

### `POST /api/v1/torrents/:id/priority`

Reprioritize a file within the torrent. `priority` is `0` (skip), `1` (normal)
or `2` (high — deselect everything else).

**Request**

```json
{ "fileIndex": 0, "priority": 2 }
```

**Responses**

- `204 No Content`
- `422 Unprocessable Entity` — priority out of range
- `404 Not Found`

### `GET /api/v1/torrents/:id/ws` (WebSocket)

Live progress stream. The browser WebSocket API cannot set custom headers, so
the access token is passed via `?token=<jwt>` instead of `Authorization`.

After upgrade the server subscribes to `torrent:progress:<infoHash>` on Redis
(published every 2s by the torrent-engine) and forwards every message verbatim.
A single `{"type":"subscribed","infoHash":"..."}` frame is sent on connect so
the client knows the stream is live.

**Progress frame**

```json
{
  "infoHash": "<40-hex>",
  "progress": 0.42,
  "downloadSpeed": 1048576,
  "uploadSpeed": 0,
  "peers": 17
}
```

Close behaviors:
- Client closes → server cancels the subscription.
- Session deleted → subscription remains live but no further messages arrive.

### `torrentSessionDTO` shape

```json
{
  "id": "uuid",
  "infoHash": "40-hex",
  "name": "…",
  "status": "fetching_metadata" | "downloading" | "seeding" | "paused" | "error",
  "totalSize": 0,
  "downloadedBytes": 0,
  "peersCount": 0,
  "downloadSpeed": 0,
  "uploadSpeed": 0,
  "files": [
    {
      "id": "uuid",
      "index": 0,
      "name": "…",
      "length": 0,
      "mimeType": "…",
      "fileType": "image" | "pdf" | "epub" | "cbz" | "cbr" | "unknown",
      "priority": 0 | 1 | 2
    }
  ],
  "createdAt": "2026-04-15T00:00:00Z"
}
```

---

## Reader

All reader endpoints require authentication. Image-level endpoints accept the
access token on either the `Authorization` header **or** a `?token=` query
param, since `<img>` and `<video>` tags cannot set headers.

### `GET /api/v1/reader/:id/pages`

List the readable pages of a torrent session. Non-image files are filtered
out and image files are sorted by filename using natural (numeric-aware)
ordering, so `page-2.jpg` precedes `page-10.jpg`. Each page's `index` is
reassigned to its post-sort position.

**Response** — `200 OK`

```json
[
  {
    "index": 0,
    "fileId": "uuid",
    "name": "page-001.jpg",
    "mimeType": "image/jpeg",
    "length": 284931
  }
]
```

`404 Not Found` if the session does not exist or belongs to another user.

### `GET /api/v1/stream/:fileId`

Stream the bytes of a single file. Range requests are forwarded to the
torrent-engine so the browser's image/video loader fetches only the bytes it
needs. `Content-Type`, `Content-Length`, `Content-Range`, `Accept-Ranges`,
`ETag` and `Last-Modified` are forwarded from the engine response.

Auth: `Authorization: Bearer <jwt>` **or** `?token=<jwt>`.

- `200 OK` / `206 Partial Content` — streamed bytes
- `401 Unauthorized`
- `404 Not Found`

### `GET /api/v1/stream/:fileId/:page` (legacy)

Alias of `/stream/:fileId`. The `:page` segment is currently ignored —
pagination is done by the browser's range loader, not the server.

> **PDF.js integration.** The web client opens `/stream/:fileId?token=…` as
> the `url` of `pdfjs.getDocument(...)` with `disableStream: false` and a
> `rangeChunkSize` of 64 KiB, so PDF.js issues a sequence of
> `Range: bytes=start-end` requests that the API proxies verbatim to the
> torrent-engine. `Accept-Ranges: bytes` **must** be present on the engine
> response for range mode to kick in.

---

## Library

### `GET /api/v1/library`

List the authenticated user's library. Each card includes a `isFavorite` flag
and the most recent reading-progress across the session's files.

**Query params:**

| Param | Values | Description |
|-------|--------|-------------|
| `type` | `manga`, `book`, `document`, `other`, `all` (default) | Filter by content type |
| `favorites` | `true` | Show favorites only |

**Response** — `200 OK`

```json
[
  {
    "id": "uuid",
    "sessionId": "uuid",
    "title": "…",
    "coverUrl": "…",
    "type": "manga",
    "addedAt": "2026-04-16T00:00:00Z",
    "isFavorite": true,
    "currentPage": 12,
    "totalPages": 30,
    "lastReadAt": "2026-04-16T00:00:00Z"
  }
]
```

### `POST /api/v1/library`

Add a torrent session to the library. Title defaults to the session name if
empty. `type` defaults to `other`. The session must belong to the user.

**Request**

```json
{ "sessionId": "uuid", "type": "manga", "title": "Optional custom title" }
```

- `201 Created` — `libraryCardDTO`
- `409 Conflict` — session already in library
- `422 Unprocessable Entity` — invalid sessionId or type
- `404 Not Found` — session not found or not owned

### `DELETE /api/v1/library/:id`

- `204 No Content`
- `404 Not Found`

### `POST /api/v1/library/:id/favorite`

Mark a library item as favorite (idempotent).

- `204 No Content`
- `404 Not Found`

### `DELETE /api/v1/library/:id/favorite`

Unmark a library item as favorite.

- `204 No Content`
- `404 Not Found`

---

## Progress

### `GET /api/v1/progress/:fileId`

Return the user's reading progress for a file. If no progress has been saved
yet, returns `200 OK` with a default payload (`currentPage: 0`, mode
`paginated`) rather than `404`, so the reader does not need to special-case
first opens.

```json
{
  "fileId": "uuid",
  "currentPage": 12,
  "totalPages": 30,
  "readingMode": "paginated" | "webtoon" | "double-page",
  "lastReadAt": "2026-04-15T00:00:00Z"
}
```

### `PUT /api/v1/progress/:fileId`

Upsert progress. `totalPages` may be omitted or `0` on subsequent calls; the
previously stored value is preserved via `COALESCE`. `readingMode` defaults
to `paginated` when empty.

**Request**

```json
{
  "currentPage": 12,
  "totalPages": 30,
  "readingMode": "paginated"
}
```

**Responses**

- `200 OK` — returns the stored progress
- `422 Unprocessable Entity` — `currentPage` is negative, greater than
  `totalPages`, or `readingMode` is not one of the three known values
- `404 Not Found` — file does not exist or is not owned by the user

---

## Admin

All admin endpoints require authentication **and** `role = "admin"`.

### `GET /api/v1/admin/torrents`

List every torrent session in the system, newest first. Each item includes
`userId`, speeds, peers, and download progress — everything needed to render
a live dashboard.

**Response** — `200 OK`

```json
[
  {
    "id": "uuid",
    "userId": "uuid",
    "infoHash": "40-hex",
    "name": "…",
    "status": "downloading",
    "totalSize": 0,
    "downloadedBytes": 0,
    "peersCount": 5,
    "downloadSpeed": 1048576,
    "uploadSpeed": 0,
    "createdAt": "2026-04-16T00:00:00Z"
  }
]
```

### `POST /api/v1/admin/torrents/:id/pause`

Pause a torrent. Sets DB status to `paused` and best-effort removes it from
the engine. Idempotent — calling on an already-paused torrent is a no-op.

- `204 No Content`
- `404 Not Found`

### `POST /api/v1/admin/torrents/:id/resume`

Resume a paused torrent. Re-adds the magnet to the engine and transitions
status back to `downloading`.

- `204 No Content`
- `422 Unprocessable Entity` — session is not paused
- `404 Not Found`

### `DELETE /api/v1/admin/torrents/:id`

Delete a torrent from both the engine and the database (cascades to files,
progress, library items).

- `204 No Content`
- `404 Not Found`

---

## Internal endpoints (engine → api)

Guarded by the shared `API_WEBHOOK_SECRET` header `X-Webhook-Secret`. Not
exposed outside the Docker internal network.

### `POST /internal/torrents/:infoHash/metadata`

Called by the engine once the swarm yields metadata.

**Request**

```json
{
  "name": "…",
  "totalLength": 0,
  "files": [
    { "index": 0, "name": "…", "path": "…", "length": 0, "mimeType": "…", "fileType": "cbz" }
  ]
}
```

**Responses**

- `204 No Content` — metadata applied, session transitioned to `downloading`
- `401 Unauthorized` — missing or wrong `X-Webhook-Secret`
- `404 Not Found` — no session exists for this info hash
- `503 Service Unavailable` — webhook secret not configured on the API

---

## Token shape

Access and refresh tokens share the same claim layout, signed with separate
secrets:

```json
{
  "uid": "uuid",
  "role": "user" | "admin",
  "typ": "access" | "refresh",
  "iss": "torrentleaf",
  "sub": "<uid>",
  "iat": 1700000000,
  "nbf": 1700000000,
  "exp": 1700000900
}
```
