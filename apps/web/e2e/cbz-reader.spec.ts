import { test, expect, type Page } from '@playwright/test'

// Tiny 1x1 PNG for stream responses. We only need the <img> to load without
// error; actual image validity is verified by unit tests on the engine.
const PNG_1x1 = Buffer.from(
  '89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c489000000' +
    '0d49444154789c636000010000050001a5f645400000000049454e44ae426082',
  'hex',
)

const SESSION_ID = '11111111-1111-1111-1111-111111111111'
const CBZ_FILE_ID = '22222222-2222-2222-2222-222222222222'

/**
 * Seed the zustand auth store before the app boots so /torrents is reachable
 * without going through the login form. `isAuthenticated()` just needs a
 * non-empty accessToken.
 */
async function seedAuth(page: Page): Promise<void> {
  await page.addInitScript(() => {
    const state = {
      state: {
        user: { id: 'u1', username: 'tester', email: 'tester@example.com', role: 'user' },
        accessToken: 'e2e-token',
        refreshToken: 'e2e-refresh',
      },
      version: 0,
    }
    window.localStorage.setItem('torrentleaf-auth', JSON.stringify(state))
  })
}

/**
 * Install route handlers on the fake API host that the dev server is
 * configured against. Returns a counter so tests can assert the stream was hit.
 */
async function installMockApi(
  page: Page,
  opts: { archiveNotReadyFirst?: boolean } = {},
): Promise<{ streamHits: string[] }> {
  const streamHits: string[] = []
  let pagesCallCount = 0

  await page.route('http://127.0.0.1:9999/**', async (route) => {
    const url = new URL(route.request().url())
    const path = url.pathname

    // Torrent detail — lists the session plus its files.
    if (path === `/api/v1/torrents/${SESSION_ID}`) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          id: SESSION_ID,
          infoHash: 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeef',
          name: 'Test Series Vol 1',
          status: 'downloading',
          totalSize: 1024,
          downloadedBytes: 512,
          peersCount: 3,
          downloadSpeed: 100,
          uploadSpeed: 0,
          files: [
            {
              id: CBZ_FILE_ID,
              index: 0,
              name: 'chapter-001.cbz',
              length: 1024,
              mimeType: 'application/vnd.comicbook+zip',
              fileType: 'cbz',
              priority: 1,
            },
          ],
          createdAt: new Date().toISOString(),
        }),
      })
    }

    // Reader pages — either 503 once then success (not-ready case) or direct
    // success. Verifies the retry-on-503 UX works.
    if (path === `/api/v1/reader/${SESSION_ID}/pages`) {
      pagesCallCount++
      if (opts.archiveNotReadyFirst && pagesCallCount === 1) {
        return route.fulfill({
          status: 503,
          contentType: 'application/json',
          body: JSON.stringify({ error: 'archive not ready' }),
        })
      }
      // Hold the retry briefly so the loading/not-ready state is reliably
      // observable before pages materialize. Without this the 503→200 flip is
      // instant and the transient copy can flash faster than the assertion polls
      // on a cold CI render (Next compiles the route on first navigation in dev).
      if (opts.archiveNotReadyFirst) {
        await new Promise((resolve) => setTimeout(resolve, 600))
      }
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify([
          {
            index: 0,
            fileId: CBZ_FILE_ID,
            entryIndex: 0,
            name: 'p01.png',
            mimeType: 'image/png',
            length: PNG_1x1.length,
          },
          {
            index: 1,
            fileId: CBZ_FILE_ID,
            entryIndex: 1,
            name: 'p02.png',
            mimeType: 'image/png',
            length: PNG_1x1.length,
          },
        ]),
      })
    }

    // Progress endpoints — permissive.
    if (path.startsWith(`/api/v1/progress/${CBZ_FILE_ID}`)) {
      return route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          fileId: CBZ_FILE_ID,
          currentPage: 0,
          totalPages: 2,
          readingMode: 'paginated',
          lastReadAt: new Date().toISOString(),
        }),
      })
    }

    // CBZ entry stream — returns the canned PNG.
    if (path.startsWith(`/api/v1/stream/${CBZ_FILE_ID}`)) {
      streamHits.push(path)
      return route.fulfill({
        status: 200,
        contentType: 'image/png',
        body: PNG_1x1,
      })
    }

    // Default: pass through so Next's own HMR/asset fetches still work.
    return route.fallback()
  })

  return { streamHits }
}

test.describe('CBZ reading flow', () => {
  test('torrent detail → read button → pages render from stream', async ({ page }) => {
    await seedAuth(page)
    const mock = await installMockApi(page)

    await page.goto(`/torrents/${SESSION_ID}`)

    // Session name and the CBZ file row are visible.
    await expect(page.getByRole('heading', { name: /Test Series Vol 1/ })).toBeVisible()
    await expect(page.getByText('chapter-001.cbz')).toBeVisible()

    // Click the per-file Read button (CBZ → manga reader route with fileId).
    await page.getByRole('link', { name: /Read/i }).first().click()

    await expect(page).toHaveURL(
      new RegExp(`/read/manga/${SESSION_ID}\\?fileId=${CBZ_FILE_ID}`),
    )

    // Wait for the reader to render at least one image fetched from /stream.
    await expect
      .poll(() => mock.streamHits.length, { timeout: 10_000 })
      .toBeGreaterThan(0)

    // Stream URLs must include the entryIndex path segment (not query).
    expect(mock.streamHits[0]).toMatch(new RegExp(`/api/v1/stream/${CBZ_FILE_ID}/\\d+$`))
  })

  test('503 on pages triggers retry and eventually renders', async ({ page }) => {
    await seedAuth(page)
    await installMockApi(page, { archiveNotReadyFirst: true })

    await page.goto(`/read/manga/${SESSION_ID}?fileId=${CBZ_FILE_ID}`)

    // Loading or "not ready" copy shows briefly. Timeout matches the other
    // reader assertions (10s+) to tolerate cold dev-mode route compilation in CI.
    await expect(
      page.getByText(/Archive not ready|Loading/i).first(),
    ).toBeVisible({ timeout: 15_000 })

    // Retry lands, pages materialize, page counter shows "1 / 2".
    await expect(page.getByText('1 / 2')).toBeVisible({ timeout: 15_000 })
  })
})
