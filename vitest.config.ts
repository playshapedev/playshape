import { defineVitestConfig } from '@nuxt/test-utils/config'

export default defineVitestConfig({
  test: {
    environment: 'happy-dom',
    globals: true,
    include: [
      '**/*.spec.ts',
      '**/*.test.ts',
    ],
    exclude: [
      'node_modules/**',
      'dist/**',
      'dist-electron/**',
      '.nuxt/**',
      '.output/**',
    ],
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
      inline: [
        /@nuxt\/test-utils/,
      ],
    },
  },
})
