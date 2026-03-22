import { setup } from '@nuxt/test-utils'
import { beforeAll } from 'vitest'
import { mkdirSync, existsSync } from 'node:fs'
import { join } from 'node:path'

// Configure test environment with isolated test database
beforeAll(async () => {
  // Set up test database directory
  const testDbDir = join(process.cwd(), 'data', 'test')
  if (!existsSync(testDbDir)) {
    mkdirSync(testDbDir, { recursive: true })
  }

  // Set environment variables for test database
  process.env.NODE_ENV = 'test'
  process.env.PLAYSHAPE_TEST_DB_PATH = join(testDbDir, 'test.db')
  process.env.PLAYSHAPE_MIGRATIONS_PATH = join(process.cwd(), 'server', 'database', 'migrations')

  await setup({
    server: true,
  })
}, 120000)
