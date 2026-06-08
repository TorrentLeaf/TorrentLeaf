# Design Tokens — TorrentLeaf

> **Source of truth.** These are the canonical design values for the landing (`/`) and
> dashboard (`/app`). The HTML artifact in `design/reference/` uses literal hex/px for
> portability — **but in `apps/web` you must use the repo tokens below (HSL CSS vars +
> Tailwind theme keys). No loose hex or px in JSX.**
>
> The repo already defines these in `apps/web/src/app/globals.css` and
> `apps/web/tailwind.config.ts`. The artifact was built to match them. Where the artifact
> used a raw hex, the **"Repo token"** column is what to actually write.

---

## 1. Colors

The repo stores colors as **HSL channel triplets** in `globals.css` and exposes them through
Tailwind. Always reference the Tailwind key (`bg-accent`, `text-foreground-muted`) or
`hsl(var(--token))` — never the hex.

### Core surfaces & text (already in globals.css)

| Role                | CSS var               | HSL              | ≈ Hex     | Tailwind key            |
|---------------------|-----------------------|------------------|-----------|-------------------------|
| App background      | `--background`        | `222 47% 5%`     | `#070A0F` | `bg-background`         |
| Surface / card      | `--surface`           | `222 35% 9%`     | `#0E131C` | `bg-surface` / `bg-card`|
| Surface 2           | `--surface-2`         | `222 30% 13%`    | `#151B27` | `bg-surface-2`          |
| Surface 3           | `--surface-3`         | `222 28% 17%`    | `#1C2433` | `bg-surface-3`          |
| Border              | `--border`            | `222 25% 18%`    | `#232C3D` | `border-border`         |
| Border strong       | `--border-strong`     | `222 20% 25%`    | `#323D52` | `border-border-strong`  |
| Text                | `--foreground`        | `210 20% 92%`    | `#E6EAF0` | `text-foreground`       |
| Text muted          | `--foreground-muted`  | `210 15% 60%`    | `#8B97A8` | `text-muted-foreground` |
| Text subtle         | `--foreground-subtle` | `210 10% 40%`    | `#5C6470` | `text-foreground-subtle`*|

\* `--foreground-subtle` exists in `globals.css` but has no Tailwind alias yet — add
`'foreground-subtle': 'hsl(var(--foreground-subtle))'` under `colors` if you need a utility,
or use `text-[hsl(var(--foreground-subtle))]`.

### Accent (brand) — emerald/teal

| Role              | CSS var                | HSL             | ≈ Hex     | Tailwind key            |
|-------------------|------------------------|-----------------|-----------|-------------------------|
| Accent (brand)    | `--accent`             | `158 64% 52%`   | `#2DD4A7` | `bg-accent` / `text-accent` |
| Accent hover      | `--accent-hover`       | `158 64% 45%`   | `#27B891` | `hover:bg-accent-hover` |
| Accent muted      | `--accent-muted`       | `158 64% 20%`   | `#115240` | `bg-accent-muted`       |
| Accent foreground | `--accent-foreground`  | `222 47% 5%`    | `#070A0F` | `text-accent-foreground`|

> The artifact's `--brand: #2DD4BF` is the same emerald-teal family — **use `--accent`**.
> Buttons on accent use `text-accent-foreground` (near-black) for contrast.

### Status / data-viz colors

These drive progress bars, the transfer chart, and status icons.

| Role                     | Repo token (use this)     | HSL            | Artifact hex |
|--------------------------|---------------------------|----------------|--------------|
| Downloading / chart line | `--info`                  | `217 91% 60%`  | `#38BDF8` (cyan) |
| Seeding / complete       | `--success`               | `142 71% 45%`  | `#34D399` (green) |
| Low-speed / warning tip  | `--warning`               | `38 92% 50%`   | `#F5A524` (orange) |
| Error / destructive      | `--destructive`           | `0 72% 51%`    | `#DC2626` |
| Upload accent (chart)    | **add `--chart-upload`**  | `255 92% 76%`  | `#A78BFA` (violet) |

> **Upload violet is the one new token.** The repo has no purple. Add it to `globals.css`:
> `--chart-upload: 255 92% 76%;` and alias in Tailwind as `'chart-upload'`. Don't hardcode `#A78BFA`.

---

## 2. Typography

| Token        | Value                                                        |
|--------------|--------------------------------------------------------------|
| Sans family  | `var(--font-geist-sans)` → Geist, Inter, system-ui (Tailwind `font-sans`) |
| Mono family  | `var(--font-geist-mono)` → Geist Mono (Tailwind `font-mono`) |
| Font features| `font-feature-settings: 'cv11', 'ss01'` (set on `html, body` in globals.css) |

Geist is already wired in `apps/web` via `next/font`. **Do not re-import from Google Fonts** —
the artifact does that only because it runs standalone.

### Type scale used in the designs

| Use                       | Size                              | Weight | Tracking      | Notes |
|---------------------------|-----------------------------------|--------|---------------|-------|
| Hero H1                   | `clamp(34px, 7.5vw, 72px)`        | 700    | `-0.035em`    | `text-balance`, gradient fill |
| Hero subcopy              | `clamp(14px, 1.6vw, 17px)`        | 400    | normal        | `text-pretty`, `leading-[1.55]` |
| Section / feature title   | 15px                              | 600    | normal        | |
| Body / feature copy       | 13px                              | 400    | normal        | `leading-[1.5]` |
| Table cell                | 12px                              | 400    | normal        | `tabular-nums` |
| Table / micro label       | 10px                              | 600    | `0.12em`      | uppercase |
| Big rate number           | `clamp(20px, 2.4vw, 24px)`        | 600    | `-0.01em`     | `tabular-nums` |
| Nav link / button         | 14px                              | 500–600| normal        | |

> All numeric values (rates, sizes, counts, progress) use `tabular-nums`
> (`font-variant-numeric: tabular-nums`) so they don't jitter while animating.

---

## 3. Spacing

Use Tailwind's default 4px scale. Container paddings step up by breakpoint:

| Region            | < md     | md (768) | lg (1024) |
|-------------------|----------|----------|-----------|
| Page card padding | `12px`   | `20px`   | `24px`    |
| Nav padding       | `20px`   | `24px 32px` | `28px 48px` |
| Hero padding      | `24px 20px` | `48px 32px` | `64px 48px` |
| Feature bar margin| `16px 12px` | `24px 32px` | `24px 48px` |
| Card / panel pad  | `12–14px`| `14–18px`| `14–18px` |

Common gaps: `gap-1` (4px) sidebar items, `gap-3` (12px) card internals, `gap-6` (24px) feature grid.

---

## 4. Radius

| Token        | Value      | rem        | Use |
|--------------|------------|------------|-----|
| `--radius`   | `0.75rem`  | 12px       | Cards, app window, buttons (`rounded-lg`) |
| `--radius-sm`| `0.5rem`   | 8px        | Sidebar items, inputs, chart area (`rounded-md`) |
| `--radius-xs`| `0.375rem` | 6px        | Chips, toggles, small controls (`rounded-sm`) |
| pill         | `999px`    | —          | Eyebrow, nav CTA, progress bars, badges (`rounded-full`) |
| page card    | `20 / 28 / 32px` (sm/md/lg) | — | Landing outer card only |

> Tailwind maps `rounded-lg → --radius`, `rounded-md → --radius-sm`, `rounded-sm → --radius-xs`
> (see `tailwind.config.ts`). Use those utilities; avoid arbitrary `rounded-[12px]`.

---

## 5. Shadows & effects

| Use            | Value |
|----------------|-------|
| Page card      | `0 1px 0 rgba(255,255,255,.04) inset, 0 60px 120px -30px rgba(0,0,0,.6), 0 0 0 1px rgba(0,0,0,.5)` |
| App window     | `0 1px 0 rgba(255,255,255,.06) inset, 0 40px 80px -20px rgba(0,0,0,.7), 0 0 0 1px rgba(0,0,0,.5)` |
| Phone / drawer | `0 1px 0 rgba(255,255,255,.05) inset, 0 30px 60px -15px rgba(0,0,0,.7), 0 0 0 1px rgba(0,0,0,.5)` |
| Progress glow  | `0 0 8px hsl(var(--info) / .5)` (cyan) · `0 0 8px hsl(var(--success) / .5)` (green) |
| Accent CTA     | `0 12px 32px -10px hsl(var(--accent) / .55), inset 0 1px 0 rgba(255,255,255,.3)` |

Radial glows (hero + preview): teal `hsl(var(--accent) / .18)` and cyan `hsl(var(--info) / .10)`
ellipses, blurred 20px, behind content. See `styles.reference.css` `.preview-glow` / `.page-card`.

Card gradient util already exists: `bg-gradient-card`
(`linear-gradient(135deg, surface 0%, surface-2 100%)`).

---

## 6. Breakpoints (Tailwind defaults — do not change)

| Name | Min width | Landing behavior | Dashboard behavior |
|------|-----------|------------------|--------------------|
| base | 0         | hamburger drawer, stacked, phone hidden, features 1-col | bottom nav, table→cards, panels stacked |
| sm   | 640       | larger padding | — |
| md   | 768       | features 2-col, preview sidebar→pill strip | sidebar→icon rail, PEERS hidden, panels stacked |
| lg   | 1024      | full nav, phone mock visible, features 3-col | full sidebar + table + chart/stats side-by-side |
| xl   | 1280      | wider preview gutter | — |

**Hard rule:** no horizontal scroll at **360 / 390 / 768 / 1024 / 1440**. Verify every PR.

---

## 7. Animation

| What            | Behavior |
|-----------------|----------|
| Rates ↓/↑       | tween to new value ~every 1s |
| Progress bars   | `transition: width .6s ease`; at 100% item flips `downloading → seeding` (cyan→green, ↓→↑ icon), sidebar/badge counts update |
| Transfer chart  | "breathes" continuously; tip dot pulses (`r 3.5→7`, 1.6s loop); tip + line-end turn `--warning` orange when speed < ~9 MB/s |
| Counters        | `Time elapsed` increments, `Time left` decrements |
| **Reduced motion** | `@media (prefers-reduced-motion: reduce)` disables all loops & transitions; render the final static state |

Single source of truth: one `requestAnimationFrame` loop (see `useAnimatedDashboard` in
`components.reference.jsx`). All ticking state derives from it. Mock data lives in
`INITIAL_TORRENTS` in the same file.
