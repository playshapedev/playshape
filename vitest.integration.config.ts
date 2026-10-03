// Vitest configuration for Tier 3: Integration tests
// These tests use @nuxt/test-utils/e2e for API route testing
// Note: E2E tests must run in 'node' environment, not 'nuxt' environment
import { defineVitestConfig } from '@nuxt/test-utils/config'

export default defineVitestConfig({
  test: {
    name: 'integration',
    // E2E tests using setup() and $fetch must use 'node' environment
    // See: https://nuxt.com/docs/getting-started/testing#conflict-with-end-to-end-testing
    environment: 'node',
    include: [
      'tests/api/**/*.test.ts',
      'tests/api/**/*.spec.ts',
      'app/composables/**/*.spec.ts',
    ],
    exclude: [
      'node_modules/**',
      'dist/**',
      'dist-electron/**',
      '.nuxt/**',
      '.output/**',
    ],
    globals: true,
    setupFiles: ['./tests/setup.ts'],
    pool: 'forks',
    // Ensure we don't bundle test runner specific code
    server: {
      deps: {
        external: ['bun:test'],
      },
    },
  },
  // Add resolve configuration to handle bun:test
  resolve: {
    alias: {
      'bun:test': 'vitest',
    },
  },
})
