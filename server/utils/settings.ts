import { eq } from 'drizzle-orm'
import { settings } from '../database/schema'
import { useDb } from './db'

/**
 * Get a setting value by key.
 * Returns the parsed JSON value, or the default if not found.
 */
export function getSetting<T>(key: string, defaultValue: T): T {
  const db = useDb()
  const row = db.select().from(settings).where(eq(settings.key, key)).get()
  if (!row || row.value === null) return defaultValue
  return row.value as T
}

/**
 * Set a setting value by key.
 * The value is stored as JSON.
 */
export function setSetting<T>(key: string, value: T): void {
  const db = useDb()
  const now = new Date()

  // Upsert: insert or update on conflict
  db.insert(settings)
    .values({ key, value: value as unknown as null, updatedAt: now })
    .onConflictDoUpdate({
      target: settings.key,
      set: { value: value as unknown as null, updatedAt: now },
    })
    .run()
}

/**
 * Known setting keys with their types and defaults.
 */
export const SETTINGS = {
  /** Enable LLM-based content cleanup when importing documents */
  contentCleanupEnabled: {
    key: 'content_cleanup_enabled',
    default: false as boolean,
  },
} as const

/**
 * Type-safe getters for known settings.
 */
export function getContentCleanupEnabled(): boolean {
  return getSetting(SETTINGS.contentCleanupEnabled.key, SETTINGS.contentCleanupEnabled.default)
}

export function setContentCleanupEnabled(value: boolean): void {
  setSetting(SETTINGS.contentCleanupEnabled.key, value)
}
