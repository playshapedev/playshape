import { sql } from 'drizzle-orm'

export default defineEventHandler(() => {
  const isElectron = !!process.versions?.electron

  // Verify database is accessible
  let dbStatus: 'ok' | 'error' = 'error'
  try {
    const db = useDb()
    db.get(sql`SELECT 1`)
    dbStatus = 'ok'
  }
  catch {
    dbStatus = 'error'
  }

  return {
    status: dbStatus === 'ok' ? 'ok' as const : 'degraded' as const,
    platform: isElectron ? 'electron' : 'web',
    database: dbStatus,
    timestamp: Date.now(),
  }
})
