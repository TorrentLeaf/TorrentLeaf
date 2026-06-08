# Stage prompts — TorrentLeaf implementation

Copy one block at a time into Claude Code, in order. Each follows the same shape, so you can
clone any block and just swap the scope. **Don't paste them all at once** — one PR per stage,
review, then continue.

Every prompt ends with the same self-check (the Definition of Done from `CLAUDE.md`).

---

## Reusable template (the mold)

```
Implement <SCOPE> for apps/web.

Follow design/reference/<FILES> and design/reference/tokens.md as the source of truth.
Rules:
- Don't invent colors, spacings, radii, or fonts. Use the repo tokens
  (hsl(var(--token)) / Tailwind keys). No loose hex or px in JSX.
- Reuse the primitives already in apps/web/src/components/ui/. Don't re-implement
  a Button/Progress/Dialog/etc. that already exists.
- Use lucide-react for icons and cn() for class merging.
- Mobile-first. No horizontal scroll at 360/390/768/1024/1440.
- 'use client' only where you animate or hold state.
- No new dependencies.

Scope of THIS PR (do only this):
<BULLETS>

When done, self-check:
- [ ] No horizontal scroll at 360/390/768/1024/1440
- [ ] No stray hex/px in JSX; tokens only
- [ ] Reused ui/ primitives where they exist
- [ ] Matches design/reference/screenshots at each width (if present)
```

---

## 01 — Tokens

```
Implement the design tokens for apps/web.

Follow design/reference/tokens.md as the source of truth.
Scope of THIS PR (do only this):
- Reconcile apps/web/src/app/globals.css and tailwind.config.ts with tokens.md.
  The repo already has most tokens — verify the HSL values match tokens.md §1.
- Add ONE new token: --chart-upload: 255 92% 76%; in globals.css, and alias it in
  tailwind.config.ts colors as 'chart-upload': 'hsl(var(--chart-upload))'.
- Add a Tailwind alias for --foreground-subtle if missing.
- Confirm Geist sans/mono are wired via next/font (do NOT add Google Font imports).
- No component work in this PR.

Self-check: tokens resolve in a throwaway test class; no hardcoded hex introduced.
```

---

## 02 — Primitives

```
Implement/verify the low-level UI primitives in apps/web/src/components/ui/.

Follow design/reference/styles.reference.css and tokens.md.
Scope of THIS PR:
- Confirm Button, Card, Badge, Progress exist and match tokens (they do — reuse them).
- Add a Toggle (switch) primitive matching the .toggle style in styles.reference.css
  (26x14 track, 10px thumb, accent when on) IF one isn't already in ui/.
- Add a Sparkline primitive: inline SVG line+dot, color prop, used by mobile cards.
  See smoothPath() and the sparkline in components.reference.jsx / TorrentCardList.
- ProgressBar variants: info (downloading), success (seeding), muted (paused),
  each with the glow shadow from tokens.md §5.
Do NOT build layout or page components yet.
```

---

## 03 — Layout primitives

```
Implement the marketing layout primitives.

Follow design/reference/landing.reference.html + styles.reference.css + tokens.md.
Scope of THIS PR:
- PageShell: the floating rounded card (radius 20/28/32 at sm/md/lg) with the inset
  highlight, big drop shadow, grain overlay, and the radial teal+cyan glows behind
  content. See .page-card in styles.reference.css.
- Navbar: brand (leaf mark + wordmark), desktop links (lg+), accent "Open app" CTA,
  and a hamburger that opens a right-side Drawer (< lg). Reuse ui/drawer.
- FeatureBar: 1→2→3 col grid (base→md→lg) of icon + title + copy.
No hero, no dashboard yet.
```

---

## 04 — Hero + landing assembled

```
Implement the Hero and assemble the landing page at app route '/'.

Follow design/reference/landing.reference.* + tokens.md.
Scope of THIS PR:
- Hero: eyebrow pill, clamp() H1 with gradient + accent spans, subcopy, two CTAs.
- Compose PageShell > Navbar + Hero + (preview placeholder) + FeatureBar.
- Wire the "Open app" CTAs to /app.
- Leave the animated app preview as a static placeholder for now (stage 07 fills it).
Responsive per tokens.md §6.
```

---

## 05 — Dashboard primitives

```
Implement the dashboard widget components (presentational, mock-data props).

Follow design/reference/dashboard.reference.* + components.reference.jsx + tokens.md.
Scope of THIS PR (build these as reusable components, no route yet):
- WindowChrome (title bar: brand, Options, Help center, window controls).
- Sidebar (Overview/Downloading/Seeding/Completed with badges; Library tree;
  Settings + Notifications/Dark-theme toggles; supports a collapsed icon-rail mode).
- TorrentTable (NAME · PROGRESS · SIZE · TIME LEFT · SEEDS · PEERS; status icon;
  colored progress; active row highlight).
- TorrentCardList (mobile fallback: card per torrent w/ progress + mini-stats + sparkline).
- TransferChart (inline SVG area chart, gradient fill, pulsing glow tip, DOWNLOAD/UPLOAD toggle).
- StatsPanel (big ↓/↑ rates + 2-col stat grid).
All take data via props. Mock source comes in stage 07.
```

---

## 06 — Route /app

```
Implement the /app dashboard route assembling the stage-05 components.

Follow design/reference/dashboard.reference.jsx (responsive logic) + tokens.md.
Scope of THIS PR:
- Full-height app shell: WindowChrome on top, Sidebar + main below.
- Desktop (lg+): fixed sidebar, table at top, chart+stats side-by-side.
- Tablet (md–lg): sidebar→icon rail, hide PEERS, stack chart/stats.
- Mobile (<md): table→TorrentCardList, sidebar→bottom nav (+ drawer for full menu),
  chart full-width above 2-col stats. Hide window controls.
- Use static mock data for now; animation in stage 07.
```

---

## 07 — Animation loop + shared preview

```
Wire the animated mock-data loop and reuse the dashboard components in the landing preview.

Follow components.reference.jsx (useAnimatedDashboard, INITIAL_TORRENTS) + tokens.md §7.
Scope of THIS PR:
- A single useAnimatedDashboard hook (one requestAnimationFrame loop) driving: ↓/↑ rates
  (~1s tween), progress fills, dl→se flip at 100% (color + icon + badge counts), chart
  breathing + pulsing tip (orange < ~9 MB/s), Time elapsed up / Time left down.
- The landing preview must render the SAME dashboard components (reduced, non-interactive) —
  do not duplicate a second version.
- Comment clearly where data is mocked.
```

---

## 08 — Responsiveness pass

```
Audit and fix responsiveness across the landing and /app.

Follow tokens.md §6 + the screenshots in design/reference/screenshots/.
Scope of THIS PR:
- Test 360, 390, 768, 1024, 1440. Fix ANY horizontal scroll (min-w-0, max-w, overflow).
- Confirm table→cards below md, sidebar→bottom nav below md, features 1→2→3 col.
- Match the reference screenshots at each width.
If you have Playwright/chrome-devtools MCP, screenshot each breakpoint and diff against
design/reference/screenshots/ before declaring done.
```

---

## 09 — A11y + reduced motion

```
Accessibility and motion-preference pass.

Scope of THIS PR:
- prefers-reduced-motion: disable the RAF loop and all transitions; render final state.
- Keyboard: sidebar items, toggles, table rows, nav, drawer are focusable & operable;
  visible focus ring (ring-ring from tokens).
- aria-labels on icon-only buttons (window controls, hamburger, favorite, etc.).
- Drawer: focus trap + Esc to close + aria-hidden on background.
- Color-contrast check text on surfaces; bottom nav hit targets ≥ 44px.
```
