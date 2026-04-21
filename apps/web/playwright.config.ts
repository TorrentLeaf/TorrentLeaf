import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  reporter: 'list',
  timeout: 30_000,
  use: {
    baseURL: 'http://localhost:3100',
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } },
  ],
  webServer: {
    // The dev server points at a fake API base; tests intercept all HTTP
    // traffic via page.route() so there's no real backend required.
    command: 'next dev -p 3100',
    port: 3100,
    reuseExistingServer: !process.env.CI,
    env: {
      NEXT_PUBLIC_API_URL: 'http://127.0.0.1:9999',
      NEXT_PUBLIC_WS_URL: 'ws://127.0.0.1:9999',
    },
    timeout: 120_000,
  },
})
