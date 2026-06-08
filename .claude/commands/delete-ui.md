# /delete-ui — Add torrent delete functionality to frontend

Use this command to add the missing delete UI across the TorrentLeaf web app.

## Prompt
Implement the torrent delete UI across TorrentLeaf's frontend.

**Context:** The backend `DELETE /api/v1/torrents/:id` endpoint already exists and works
(see `apps/api/internal/handler/torrent.go:134`). The frontend has **no delete button anywhere**.
The DB has `ON DELETE CASCADE` from `torrent_sessions` → `torrent_files`, `library_items`, `reading_progress`.

**Read before starting:**
- `.claude/agents/frontend.md`
- `CLAUDE.md` §5 (conventions) and §6.1 (English UI rule)
- `apps/web/src/lib/torrents.ts` (types, add `deleteTorrent` here)
- `apps/web/src/app/(app)/torrents/[id]/page.tsx` (torrent detail — add delete button)
- `apps/web/src/components/shared/TorrentCard.tsx` (library card — add delete option)

**Tasks:**
1. Add `deleteTorrent(id: string)` to `apps/web/src/lib/torrents.ts`
2. On the **torrent detail page** (`/torrents/[id]`):
   - Add a "Delete torrent" button (destructive variant, `Trash2` icon)
   - Show a confirmation dialog (`AlertDialog` from shadcn/ui) before deleting
   - On confirm: call `deleteTorrent`, invalidate queries, redirect to `/library`
   - Show toast on success/failure
3. On the **TorrentCard** component:
   - Add a context menu (right-click) or overflow menu (`MoreVertical` icon) with "Delete" option
   - Same confirmation dialog flow
   - Invalidate `library` query cache after delete
4. All strings in English. Use `aria-label` on all interactive elements.
5. Write a Vitest test for the `deleteTorrent` API call.
6. Run `make test-web` to validate.
