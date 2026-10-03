// Runs before each integration test file (each file gets its own process).
// Points the app at a fresh temp database and applies every migration, so
// tests never touch data/playshape.db and start from a known empty state.
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll } from 'vitest'
import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { useDb } from '~~/server/utils/db'

const dir = mkdtempSync(join(tmpdir(), 'playshape-test-'))
process.env.PLAYSHAPE_DB_PATH = join(dir, 'playshape.db')
process.env.PLAYSHAPE_USER_DATA = dir

migrate(useDb(), { migrationsFolder: join(process.cwd(), 'server', 'database', 'migrations') })

afterAll(() => {
  rmSync(dir, { recursive: true, force: true })
})
