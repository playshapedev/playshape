import { eq } from 'drizzle-orm'
import { assets } from '~~/server/database/schema'

/**
 * Update an asset.
 * PATCH /api/assets/:id
 */
export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Asset ID is required' })
  }

  const body = await readBody<{
    name?: string
    projectId?: string | null
  }>(event)

  const db = useDb()

  // Check asset exists
  const existing = db.select().from(assets).where(eq(assets.id, id)).get()
  if (!existing) {
    throw createError({ statusCode: 404, statusMessage: 'Asset not found' })
  }

  // Build update object
  const updates: Record<string, unknown> = { updatedAt: new Date() }
  if (body.name !== undefined) updates.name = body.name
  if (body.projectId !== undefined) updates.projectId = body.projectId

  db.update(assets).set(updates).where(eq(assets.id, id)).run()

  return db.select().from(assets).where(eq(assets.id, id)).get()
})
