# Handoff: TorrentLeaf — Landing (`/`) + Dashboard (`/app`)

## Overview
A dark, dashboard-style marketing landing and the full product dashboard for **TorrentLeaf** —
a torrent client that streams manga/PDF/EPUB so you can *read while it downloads*. The landing
sells the product and embeds a live, animated mini-dashboard; the `/app` dashboard is the real,
navigable screen (torrent table, transfer chart, stats, sidebar) with looping mock data.

## About the design files
The files in `design/reference/` are **design references created in HTML/JSX** — prototypes
that show the intended look and behavior. They are **not production code to copy verbatim**.
The task is to **recreate these designs inside the existing `apps/web` codebase** (Next.js App
Router + Tailwind + shadcn-style primitives), using its established patterns and tokens. The
standalone `.html` files run in a browser so you can *see and interact with* the target; the
`.jsx`/`.css` files show structure, logic, and exact values to translate into the repo's stack.

## Fidelity
**High-fidelity.** Final colors, typography, spacing, layout, interactions, and animation are
all decided. Recreate pixel-faithfully using the repo's libraries — but source every value from
the repo tokens (`tailwind.config.ts` / `globals.css`), **not** the literal hex/px in the
reference CSS (those exist only so the prototype runs standalone). See `design/reference/tokens.md`
for the artifact-hex → repo-token mapping.

## How to use this bundle
1. Copy `design/reference/` into the repo at **`design/reference/`** (outside the build).
2. Copy/merge **`CLAUDE.md`** into the repo root.
3. Open `design/reference/prompts/stage-prompts.md` and feed Claude Code **one stage at a
   time**, in order. After each PR, screenshot the dev server at the reference widths and ask
   Claude Code to diff against `design/reference/screenshots/`.

---

## Screens / Views

### 1. Landing (`/`)
- **Purpose:** market the product; primary CTA → `/app`.
- **Layout (top→bottom), inside a centered floating card (`max-w-1440`, radius 20/28/32):**
  - **Navbar** — brand left; links center-right (`lg+` only: Features, How it works, GitHub,
    Docs); accent **Open app** pill right. `< lg`: links/CTA hide, **hamburger** opens a
    right-side drawer.
  - **Hero** — centered. Eyebrow pill (`v0.4 · Sequential streaming…`), H1
    (`clamp(34→72px)`, "Read while it **downloads.**" with white→accent gradient), subcopy
    (`max-w-560`), two CTAs (accent **Open the app**, ghost **See how it works**).
  - **App preview** — the animated dashboard widget (see screen 2) shown reduced & non-interactive.
    `lg+`: a phone mock floats to its right (hidden below `lg`).
  - **FeatureBar** — Instant stream / Torrent health / Bandwidth control. Grid 1→2→3 col
    (base→md→lg); each = circular accent-outline icon + 15px/600 title + 13px muted copy.
- **Background:** near-black with a teal radial glow at top; subtle grain overlay on the card.

### 2. Dashboard (`/app`)
- **Purpose:** the real client — monitor/seed/read torrents.
- **Window chrome (top):** leaf dot-cluster + "TORRENTLEAF", `Options ▾`, centered
  `Help & resources`, window controls (—/▢/×) right. Controls hidden on mobile.
- **Sidebar (left):**
  - *OVERVIEW:* Overview, Downloading, Seeding, Completed — each a row with a numeric badge;
    active row gets an accent pill/tint. These **filter** the table.
  - *LIBRARY:* tree rows w/ chevron + icon: Manga, PDFs, EPUBs, More.
  - *SETTINGS:* Settings; Notifications (toggle); Dark theme (toggle, on).
- **Center — TorrentTable:** columns **NAME · PROGRESS · SIZE · TIME LEFT · SEEDS · PEERS**.
  Each row: status icon (`↓` downloading / `↑` seeding / `‖` paused), name + type tag, colored
  progress bar (cyan downloading / green complete / grey paused), then the numeric columns.
  Active row highlighted. Rows are clickable (select).
- **Bottom (2 col):**
  - *Left — TransferChart:* "Transfer speed" area chart, smooth cyan line, gradient fill,
    glowing pulsing tip dot; `DOWNLOAD`/`UPLOAD` toggle pills.
  - *Right — StatsPanel:* big `↓ XX.X MB/s` / `↑ XX.X MB/s`, then a 2-col grid: Seeds,
    Down/up ratio, Downloaded, Uploaded, Time elapsed, Time left.

---

## Interactions & behavior
- **Navigation:** landing CTAs + drawer → `/app`; dashboard "Landing" pill → `/`.
- **Sidebar filters** the table (Overview / Downloading / Seeding / Completed).
- **Row / card select** highlights the active torrent.
- **Toggles:** Notifications, Dark theme (visual state).
- **Chart toggle:** DOWNLOAD / UPLOAD pills.
- **Animation (mock loop):** see `tokens.md §7`. Rates tween ~1s; progress fills; at 100% an
  item flips downloading→seeding (cyan→green, ↓→↑, badge counts update); chart breathes with a
  pulsing tip that turns orange when speed < ~9 MB/s; Time elapsed ↑ / Time left ↓.
- **Reduced motion:** all loops/transitions off; render final static state.

### Responsive behavior
- **Breakpoints:** `sm 640 · md 768 · lg 1024 · xl 1280`. Mobile-first.
- **No horizontal scroll at 360 / 390 / 768 / 1024 / 1440** (hard requirement).
- **Landing:** `< lg` hamburger drawer, phone hidden, features 1→2→3 col; preview sidebar
  becomes a pill strip on mobile.
- **Dashboard:** `≥ lg` full layout · `md–lg` sidebar→icon rail, hide PEERS, stack chart/stats ·
  `< md` **table→card list**, sidebar→bottom nav (+ drawer), chart full-width over 2-col stats.

## State management
- `torrents[]` (id, name, type, size, totalSec, peers, seeds, progress, status) — animated.
- `downRate`, `upRate`, `elapsed`, `downloadedMB`, `uploadedMB`, `history[]` (chart) — ticking.
- `activeId`, `filter` — selection/filter. UI: `notifications`, `darkTheme`, `chartMode`,
  `drawerOpen`. Viewport width drives mobile/tablet/desktop branch.
- All derived from one RAF loop (`useAnimatedDashboard`). **Mock data → real torrent-engine
  data** is the only data swap needed; see `INITIAL_TORRENTS` and the hook in
  `components.reference.jsx` (commented).

## Design tokens
See **`design/reference/tokens.md`** — full tables for colors (with HSL + repo Tailwind keys),
typography scale, spacing, radius, shadows, breakpoints, animation. The repo already defines
them in `globals.css` / `tailwind.config.ts`; only **`--chart-upload`** (upload violet) is new.

## Assets
No raster assets. The leaf logo and all icons are inline SVG in the references — in `apps/web`
use **`lucide-react`** equivalents where they exist; keep the custom leaf mark as a small SVG
component. Fonts (Geist / Geist Mono) are already wired via `next/font` — don't re-import.

## Files (in this bundle)
| Path | Notes |
|------|-------|
| `CLAUDE.md` | Repo-root rules: contract location, stack, tokens, breakpoints, build order, DoD. |
| `design/reference/tokens.md` | Canonical token tables + artifact→repo mapping. |
| `design/reference/landing.reference.html` | Standalone landing prototype. |
| `design/reference/dashboard.reference.html` | Standalone dashboard prototype. |
| `design/reference/components.reference.jsx` | Shared components, mock data, animation hook. |
| `design/reference/landing.reference.jsx` | Landing composition. |
| `design/reference/dashboard.reference.jsx` | Dashboard responsive composition. |
| `design/reference/styles.reference.css` | All widget styles (literal values → map to tokens). |
| `design/reference/prompts/stage-prompts.md` | 9 staged PR prompts + reusable template. |
| `design/reference/screenshots/` | Approved **desktop** renders (both pages) + how to generate the full 360/390/768/1024/1440 set from the dev server. |

> To run a prototype: open either `*.reference.html` directly in a browser. The `.jsx`/`.css`
> are loaded by those HTML files and also serve as the structural spec for the rebuild.
