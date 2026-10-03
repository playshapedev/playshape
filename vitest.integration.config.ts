// Vitest configuration for Tier 3: Integration tests
//
// API route handlers run in-process against a throwaway SQLite database with
// every migration applied. There's no Nuxt build or HTTP server: handlers are
// mounted on a bare h3 app (see tests/integration/utils/api.ts), and Nitro's
// auto-imports (h3 utilities + server/utils) are recreated with unimport.
import { fileURLToPath } from 'node:url'
import { defineConfig } from 'vitest/config'
import Unimport from 'unimport/unplugin'

const root = fileURLToPath(new URL('./', import.meta.url))

export default defineConfig({
  plugins: [
    Unimport.vite({
      presets: [{ package: 'h3' }],
      dirs: ['./server/utils'],
      dts: false,
    }),
  ],
  resolve: {
    alias: {
      '~~': root,
      '~': `${root}app`,
    },
  },
  test: {
    name: 'integration',
    environment: 'node',
    include: ['tests/integration/**/*.test.ts'],
    setupFiles: ['./tests/integration/setup.ts'],
    globals: true,
    pool: 'forks',
  },
})
