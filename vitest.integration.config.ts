// Vitest configuration for Tier 3: Integration tests
// These tests run with Nuxt environment for API route testing
import { defineVitestConfig } from '@nuxt/test-utils/config'

export default defineVitestConfig({
  test: {
    name: 'integration',
    environment: 'nuxt',
    environmentOptions: {
      nuxt: {
        overrides: {
          // Disable certain Nuxt features for faster testing
          ssr: false,
        },
      },
    },
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
