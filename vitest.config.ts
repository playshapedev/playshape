// Vitest workspace configuration for 4-tier testing strategy
// Tier 2: unit tests (node environment for pure logic)
// Tier 3: integration tests (nuxt environment for API routes)
//
// To run all tests: npm run test
// To run only unit tests: npm run test:unit (or vitest --project unit)
// To run only integration tests: npm run test:integration (or vitest --project integration)

import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    // Use pool for better isolation between test types
    pool: 'forks',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'json'],
      reportsDirectory: './coverage',
      exclude: [
        'node_modules/**',
        'dist/**',
        'dist-electron/**',
        '.nuxt/**',
        '.output/**',
        '**/*.config.*',
        '**/*.d.ts',
        '**/types/**',
        '**/server/database/migrations/**',
        '**/scripts/**',
        '**/*.spec.ts',
        '**/*.test.ts',
      ],
      thresholds: {
        global: {
          branches: 0,
          functions: 0,
          lines: 0,
          statements: 0,
        },
      },
    },
    deps: {
      optimizer: {
        web: {
          include: [
            '@nuxt/test-utils',
          ],
        },
      },
    },
  },
})
