# Screenshots

Approved **desktop** renders of the real prototypes:

- `landing-desktop.png` — landing (`/`) at desktop width.
- `dashboard-desktop.png` — dashboard (`/app`) at desktop width.

## Generating the full breakpoint set (360 / 390 / 768 / 1024 / 1440)

These weren't pre-baked because faithful per-viewport captures need a real browser viewport.
Produce them from the running prototype or the rebuilt app — this is also your stage-08 visual
feedback loop:

**Quick (Chrome DevTools):** open `design/reference/landing.reference.html` (and
`dashboard.reference.html`), toggle device toolbar (Cmd/Ctrl+Shift+M), set each width, capture
full-page screenshots → save as `landing-360.png`, `landing-390.png`, … `dashboard-1440.png`.

**Automated (Playwright / chrome-devtools MCP — recommended, matches your workflow):**
point it at the dev server, loop `[360, 390, 768, 1024, 1440]`, screenshot each route, and have
Claude Code diff the rebuild against `landing-desktop.png` / `dashboard-desktop.png` and these
captures. Assert **no horizontal scroll** at every width
(`document.documentElement.scrollWidth <= window.innerWidth`).
