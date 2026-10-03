// Root Vitest config: runs both test tiers as projects.
//   pnpm test                    → unit + integration
//   pnpm test:unit               → Tier 2, pure logic (vitest.unit.config.ts)
//   pnpm test:integration        → Tier 3, API routes on a temp DB (vitest.integration.config.ts)
// See TESTING.md for what belongs in each tier.
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    projects: ['./vitest.unit.config.ts', './vitest.integration.config.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json-summary'],
      reportsDirectory: './coverage',
      include: ['lib/**/*.ts', 'server/**/*.ts', 'app/utils/**/*.ts', 'app/composables/**/*.ts'],
      exclude: [
        '**/*.test.ts',
        '**/*.spec.ts',
        '**/*.d.ts',
        'server/database/migrations/**',
      ],
    },
  },
})
