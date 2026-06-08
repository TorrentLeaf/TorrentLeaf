# /reader-overhaul — Complete reader rewrite for Manga, PDF, and EPUB

Use this command to overhaul ALL three readers with a premium, Seanime-inspired UX.

## Prompt
Completely rewrite the MangaReader, PdfReader, and EpubReader components for TorrentLeaf
with a premium, modern UX inspired by Seanime (https://github.com/5rahim/seanime).

**Context:** The current readers are described as "extremely bad and non-functional, ugly design,
elements in the middle of the screen." All three readers need overhaul, not just manga.

**Read before starting:**
- `.claude/skills/reader-components.md` (MANDATORY)
- `.claude/agents/frontend.md`
- `CLAUDE.md` §6 (design system) and §6.1 (English UI)
- Study Seanime's reader architecture:
  - `seanime-web/src/app/(main)/manga/_containers/chapter-reader/` — overlay controls, settings drawer
  - `seanime-web/src/app/(main)/manga/_lib/manga-chapter-reader.atoms.ts` — reader state management

**Key design principles (from Seanime):**
- **Overlay controls** that auto-hide after 3s of inactivity, show on mouse move/tap
- **Settings drawer** (slide-in panel) for all reader options
- **Dark, immersive background** with minimal chrome
- **Gesture support** — swipe left/right on mobile for page turns
- **Smooth transitions** — CSS transform-based page animations
- **Keyboard shortcut help** — `?` key shows shortcuts overlay

### Phase 1: Shared ReaderShell component

Create `apps/web/src/components/reader/ReaderShell.tsx`:
- Full-viewport container with dark background (`bg-black`)
- **Top bar** (overlay, auto-hide): back button, title, page counter, settings gear
- **Bottom bar** (overlay, auto-hide): progress slider, reading mode toggle
- **Side panels**: invisible tap/click zones for prev/next
- Auto-hide logic: show on mouse move, hide after 3s idle
- Mobile: show on tap, hide on tap-to-read area
- Keyboard shortcuts integrated: arrows, space, F (fullscreen), M (mode), Escape, ? (help)
- Settings drawer (right side slide-in):
  - Reading mode: Paginated / Webtoon / Double-page (manga only)
  - Fit mode: Fit Width / Fit Height / Original
  - Reading direction: LTR / RTL
  - Background: Black / Dark gray / White
  - Spacing (webtoon mode): None / Small / Medium
- Chapter/file navigation sidebar (left side slide-in):
  - List of all files in the torrent
  - Current file highlighted
  - Click to switch file without leaving reader

### Phase 2: MangaReader rewrite

Rewrite `apps/web/src/components/reader/MangaReader.tsx`:
- Use `ReaderShell` as the container
- **Paginated mode**: Single image, CSS transform transitions between pages,
  fit-width/fit-height/original scaling, click-to-advance zones
- **Webtoon mode**: Continuous vertical scroll, lazy loading with IntersectionObserver,
  configurable gap between images, smooth scroll-to-page on slider drag
- **Double-page mode**: Two images side by side, proper RTL support (right-to-left layout)
- Image preloading: preload ±5 pages, show loading skeleton with shimmer
- Pinch-to-zoom on mobile
- Progress save on page change (debounced, same hook as before)
- Smooth image loading: fade-in when loaded, skeleton while loading

### Phase 3: PdfReader rewrite

Rewrite `apps/web/src/components/reader/PdfReader.tsx`:
- Use `ReaderShell` as the container
- PDF.js canvas rendering (keep existing range-request logic)
- **Sidebar**: PDF outline/TOC (if available), page thumbnails
- Zoom controls in the overlay bar (same as before but integrated into ReaderShell)
- Fit-to-width default (responsive to viewport)
- Text selection support
- Scroll mode: continuous or paginated
- Page number input (click on "3 / 50" to type a page number)

### Phase 4: EpubReader rewrite

Rewrite `apps/web/src/components/reader/EpubReader.tsx`:
- Use `ReaderShell` as the container
- epub.js rendering (keep existing logic)
- **Settings drawer additions** specific to EPUB:
  - Font size slider (12px–32px)
  - Font family selector (serif/sans-serif/monospace)
  - Line height
  - Margins
  - Theme: Light / Sepia / Dark
- **Table of Contents** sidebar from epub TOC
- Chapter progress indicator (not just page)
- Proper CFI-based progress persistence (already exists, keep it)

### Phase 5: Polish

- Loading states: full-viewport skeleton with animated shimmer
- Error states: friendly message with retry button, not raw error text
- Transition between files: smooth fade when switching chapters
- Mobile responsiveness: all controls thumb-reachable
- Performance: virtualize webtoon mode for 200+ page manga
- Accessibility: all controls have `aria-label`, keyboard navigable

### Tests
- Update `MangaReader.test.tsx` for new component API
- Add tests for `ReaderShell` auto-hide behavior
- Run `make test-web`

**All UI strings in English. No Portuguese text in any component.**
