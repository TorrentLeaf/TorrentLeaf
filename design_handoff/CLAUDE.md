# CLAUDE.md — TorrentLeaf web

> Drop this at the **repo root** (or merge into the existing one). It fixes the rules that
> should not be re-derived every turn: where the design contract lives, the stack, canonical
> tokens, breakpoints, build order, and the definition of done.

---

## Design system contract

The approved design for the landing (`/`) and dashboard (`/app`) lives in
**`design/reference/`**. Treat it as the **source of truth**, not inspiration:

| File | What it is |
|------|------------|
| `design/reference/tokens.md` | **Canonical** colors, type, spacing, radius, shadow, breakpoints, animation. Read first. |
| `design/reference/landing.reference.html` | Standalone landing prototype (open in a browser to interact). |
| `design/reference/dashboard.reference.html` | Standalone dashboard prototype. |
| `design/reference/components.reference.jsx` | Shared component logic + mock data + animation hook. |
| `design/reference/landing.reference.jsx` | Landing composition. |
| `design/reference/dashboard.reference.jsx` | Dashboard composition (responsive logic). |
| `design/reference/styles.reference.css` | All widget styles (literal hex/px — **map to tokens**, don't copy). |
| `design/reference/screenshots/` | Approved desktop renders for both pages (+ instructions to generate the 360/390/768/1024/1440 set from the dev server). Compare against these. |

**Every change is compared against this folder.** When in doubt, open the reference and match it.

---

## Stack & conventions (`apps/web`)

- **Next.js (App Router)** + TypeScript. Routes under `src/app`; the app shell is the
  `(app)` route group, auth is `(auth)`.
- **Tailwind CSS**, dark mode by `class`. Theme in `tailwind.config.ts`, tokens in
  `src/app/globals.css`.
- **UI primitives** are shadcn-style in `src/components/ui/` (`button`, `card`, `badge`,
  `progress`, `dialog`, `drawer`, `input`, `separator`, `skeleton`, `toast`). **Reuse these.**
  Don't hand-roll a button/progress/toggle if one exists.
- **Icons:** `lucide-react`. Don't paste raw inline SVGs when a lucide icon exists.
- **Class merging:** `cn()` from `@/lib/utils`. Variants via `class-variance-authority` (see
  `ui/button.tsx` for the pattern).
- **Client components:** add `'use client'` only where you animate or use state/effects.
- **Animation:** CSS + a single `requestAnimationFrame`/`setInterval` loop with cleanup, or
  `framer-motion` **only if already a dependency** — do not add new libraries. Charts are
  **inline SVG** (or `recharts` only if already present).

---

## Canonical tokens (never reinvent)

Full table in `design/reference/tokens.md`. The non-negotiables:

- Colors come from **`tailwind.config.ts` / `globals.css`** as `hsl(var(--token))`.
  **No loose hex in JSX. No arbitrary px radii.**
- Accent/brand = `--accent` (`158 64% 52%`, emerald-teal). Button text on accent =
  `--accent-foreground`.
- Data-viz: downloading/chart = `--info` (cyan), seeding/done = `--success` (green),
  low-speed tip = `--warning` (orange), errors = `--destructive`.
- **One new token to add:** `--chart-upload: 255 92% 76%;` (upload violet) in `globals.css`,
  aliased in Tailwind. Nothing else new.
- Radius: `rounded-lg` (12) cards/buttons, `rounded-md` (8) controls, `rounded-sm` (6) chips,
  `rounded-full` pills.
- Fonts: `font-sans` (Geist via `next/font`), `font-mono` (Geist Mono). Numbers use
  `tabular-nums`. **Don't import Google Fonts** — Geist is already wired.

---

## Breakpoints & responsive rules

Tailwind defaults: `sm 640 · md 768 · lg 1024 · xl 1280`. Mobile-first.

- **Hard rule — no horizontal scroll at 360 / 390 / 768 / 1024 / 1440.** Use `w-full`,
  `max-w-*`, fluid grid/flex, `min-w-0` on flex children, controlled `overflow`. No fixed px
  widths that exceed the viewport.
- Hero type uses `clamp()`.
- **Landing:** `< lg` → hamburger drawer, phone mock hidden, features 1→2→3 col.
- **Dashboard:** `≥ lg` sidebar + full table + chart/stats side-by-side · `md–lg` sidebar
  collapses to an icon rail, hide PEERS (then SEEDS if tight), stack chart/stats ·
  `< md` **table becomes a card list** (the preferred transform — never horizontal scroll),
  sidebar → bottom nav (+ drawer), chart full-width above a 2-col stats grid.

---

## Build order (small PRs — do not "implement everything")

1. **Tokens** → `tailwind.config.ts` + `globals.css` + fonts (+ `--chart-upload`).
2. **Primitives** → reuse/extend `ui/`: Button, Card, Toggle, Badge, ProgressBar, Sparkline.
3. **Layout primitives** → `PageShell` (floating card + radial glow), `Navbar`, `FeatureBar`.
4. **Hero + landing** assembled.
5. **Dashboard primitives** → `Sidebar`, `WindowChrome`, `TorrentTable`,
   `TorrentCardList` (mobile), `TransferChart`, `StatsPanel`.
6. **Route `/app`** wiring the dashboard.
7. **Animation loop** with mocks (single RAF source).
8. **Responsiveness pass** — test all 5 breakpoints.
9. **A11y + `prefers-reduced-motion`.**

Per-step prompt template lives in `design/reference/prompts/`. Each step:
> "Implement X following `design/reference/<file>` and `tokens.md`. Don't invent colors or
> spacings. Reuse the primitives already in `apps/web/src/components/ui/`."

---

## Definition of done (self-check every task)

- [ ] No horizontal scroll at **360 / 390 / 768 / 1024 / 1440**.
- [ ] Dashboard table becomes **cards** below `md`.
- [ ] Animation loop runs **and** is disabled under `prefers-reduced-motion`.
- [ ] Landing preview uses the **same components** as the real dashboard (no duplicate copy).
- [ ] Colors & spacing come from `tailwind.config` / tokens — **no stray hex or px in JSX**.
- [ ] Primitives reused from `components/ui/`, not re-implemented.
- [ ] Matches the screenshots in `design/reference/screenshots/` at each width.
