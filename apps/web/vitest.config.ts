import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import path from 'node:path'

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./vitest.setup.ts'],
    exclude: ['**/node_modules/**', '**/e2e/**', '**/.next/**'],
    coverage: {
      provider: 'v8',
      reporter: ['text-summary', 'text'],
      // Cover the business-logic surface: data helpers, hooks, and the
      // shared/dashboard components. Browser-heavy readers (PDF.js, epub.js),
      // the video player (hls.js), UI primitives, the marketing landing, and
      // Next.js app-router glue are excluded — they need integration/browser
      // harnesses rather than unit tests (see coverage scope decision).
      include: [
        'src/lib/**/*.{ts,tsx}',
        'src/hooks/**/*.{ts,tsx}',
        'src/components/dashboard/**/*.{ts,tsx}',
        'src/components/shared/**/*.{ts,tsx}',
      ],
      exclude: [
        '**/*.test.{ts,tsx}',
        '**/*.d.ts',
        'src/components/reader/**',
        'src/components/player/**',
        'src/components/ui/**',
        'src/components/marketing/**',
        // Landing-preview animation glue (marketing-only), not product logic.
        'src/components/dashboard/landing-preview.tsx',
        'src/hooks/use-animated-dashboard.ts',
      ],
    },
  },
})
