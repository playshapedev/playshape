import { desc, eq } from 'drizzle-orm'
import { assets } from '~~/server/database/schema'

/**
 * List all assets, optionally filtered by project.
 * GET /api/assets?projectId=xxx
 */
export default defineEventHandler(async (event) => {
  const query = getQuery(event)
  const projectId = query.projectId as string | undefined

  const db = useDb()

  if (projectId) {
    return db
      .select()
      .from(assets)
      .where(eq(assets.projectId, projectId))
      .orderBy(desc(assets.createdAt))
      .all()
  }

  return db
    .select()
    .from(assets)
    .orderBy(desc(assets.createdAt))
    .all()
})
