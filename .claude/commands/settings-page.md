# /settings-page — Create user settings page and API

Use this command to implement a full user settings system: backend API + database + frontend UI.

## Prompt
Implement the user settings page for TorrentLeaf.

**Context:** There is currently NO settings page, NO user preferences storage, and NO `/settings`
route. The Navbar has no link to settings. Users cannot configure download paths, reader defaults,
or account details.

**Read before starting:**
- `.claude/agents/backend.md` AND `.claude/agents/frontend.md` (multi-layer feature)
- `CLAUDE.md` §5, §6.1, §7, §8
- `apps/api/internal/handler/` — existing handler patterns
- `apps/api/internal/service/` — existing service patterns
- `apps/web/src/components/layout/Navbar.tsx` — add Settings link here
- `apps/web/src/store/auth.ts` — existing Zustand store pattern

**Implementation order:** migration → repository → service → handler → frontend

### Phase 1: Backend

#### Migration `004_user_settings.up.sql`
```sql
CREATE TABLE user_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID UNIQUE NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  download_path TEXT DEFAULT '/data/torrents',
  default_reading_mode VARCHAR(20) DEFAULT 'paginated',
  default_fit_mode VARCHAR(20) DEFAULT 'fit-width',
  reading_direction VARCHAR(5) DEFAULT 'ltr',
  auto_add_library BOOLEAN DEFAULT true,
  reader_background VARCHAR(7) DEFAULT '#000000',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_user_settings_user ON user_settings(user_id);
```

#### Domain type
Add `UserSettings` struct to domain with all fields above.

#### Repository
- `GetByUserID(ctx, userID) → (*UserSettings, error)` — auto-create with defaults if not found
- `Upsert(ctx, settings) → (*UserSettings, error)`

#### Service
- `GetSettings(ctx, userID) → (*UserSettings, error)`
- `UpdateSettings(ctx, userID, partial) → (*UserSettings, error)` — partial update (only supplied fields)

#### Handler
- `GET /api/v1/settings` → returns current user settings (auto-creates if first time)
- `PUT /api/v1/settings` → partial update, returns updated settings

#### sqlc queries
Write the SQL queries in `sqlc/queries/settings.sql` and run `make sqlc`.

### Phase 2: Frontend

#### Store
Create `apps/web/src/store/settings.ts` (Zustand) to cache settings locally.

#### API helpers
Create `apps/web/src/lib/settings.ts` with `fetchSettings()` and `updateSettings()`.

#### Settings page `apps/web/src/app/(app)/settings/page.tsx`
Sections (using shadcn Cards):
1. **General** — Download path (text input), Auto-add to library (switch)
2. **Reader Defaults** — Reading mode (select: paginated/webtoon/double-page),
   Fit mode (select: fit-width/fit-height/original), Reading direction (LTR/RTL toggle),
   Reader background color (color picker or preset swatches)
3. **Account** — Username (readonly), Email (readonly for now), Change password form

Use React Hook Form + Zod for validation. Show toast on save success/failure.

#### Navbar update
Add a `Settings` link with `Settings` (lucide) icon between Library and Add buttons.

### Phase 3: Tests
- Backend: handler + service tests for GET/PUT settings
- Frontend: Vitest test for settings page form submission
- Run `make test-api && make test-web`

**All UI strings must be in English.**
