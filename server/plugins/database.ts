import { migrate } from 'drizzle-orm/better-sqlite3/migrator'
import { join } from 'node:path'

export default defineNitroPlugin(() => {
  const db = useDb()

  // Run migrations on startup.
  // In development, migrations are in the project directory.
  // In production, they're bundled as extra resources by electron-builder.
  const migrationsFolder = process.env.PLAYSHAPE_MIGRATIONS_PATH
    || join(process.cwd(), 'server', 'database', 'migrations')

  migrate(db, { migrationsFolder })

  console.log('[database] Migrations applied, database ready')
})
