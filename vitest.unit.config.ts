// Vitest configuration for Tier 2: Unit/Logic tests
// These tests run in Node environment with no Nuxt dependencies
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    name: 'unit',
    environment: 'node',
    include: [
      'lib/**/*.test.ts',
      'app/utils/**/*.test.ts',
      'app/composables/**/*.test.ts',
      'server/**/*.test.ts',
    ],
    exclude: [
      'node_modules/**',
      'dist/**',
      'dist-electron/**',
      '.nuxt/**',
      '.output/**',
    ],
    globals: true,
    pool: 'forks',
  },
})
