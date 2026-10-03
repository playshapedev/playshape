import Database from 'better-sqlite3'
import { drizzle } from 'drizzle-orm/better-sqlite3'
import { dirname, join } from 'node:path'
import { existsSync, mkdirSync } from 'node:fs'
import * as schema from '../database/schema'

let _db: ReturnType<typeof drizzle<typeof schema>> | null = null

/**
 * Returns the Drizzle database instance. Initializes it on first call.
 *
 * In development, the database file lives at `data/playshape.db` in the
 * project root. In production (packaged Electron app), it lives in the
 * app's user data directory.
 */
export function useDb() {
  if (_db) return _db

  // PLAYSHAPE_DB_PATH points at an explicit file (used by tests to get an
  // isolated database instead of the dev one).
  const dbPath = process.env.PLAYSHAPE_DB_PATH || join(getDbDir(), 'playshape.db')
  const dbDir = dirname(dbPath)
  if (!existsSync(dbDir)) {
    mkdirSync(dbDir, { recursive: true })
  }

  const sqlite = new Database(dbPath)

  // Enable WAL mode for better concurrent read performance
  sqlite.pragma('journal_mode = WAL')
  // Enable foreign key enforcement
  sqlite.pragma('foreign_keys = ON')

  _db = drizzle(sqlite, { schema })
  return _db
}

/**
 * Resolves the directory for the database file.
 */
function getDbDir(): string {
  // In development, store next to the project
  if (process.env.NODE_ENV !== 'production') {
    return join(process.cwd(), 'data')
  }

  // In production Electron, use the app's userData path.
  // This is set by the main process via environment variable.
  if (process.env.PLAYSHAPE_USER_DATA) {
    return process.env.PLAYSHAPE_USER_DATA
  }

  // Fallback for cloud/non-Electron deployments
  return join(process.cwd(), 'data')
}
