import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { libraries } from '~~/server/database/schema'

const updateLibrarySchema = z.object({
  name: z.string().min(1, 'Library name is required').optional(),
  description: z.string().optional(),
})

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Library ID is required' })
  }

  const body = await readBody(event)
  const parsed = updateLibrarySchema.parse(body)

  const db = useDb()

  const existing = db.select().from(libraries).where(eq(libraries.id, id)).get()
  if (!existing) {
    throw createError({ statusCode: 404, statusMessage: 'Library not found' })
  }

  db.update(libraries)
    .set({
      ...parsed,
      updatedAt: new Date(),
    })
    .where(eq(libraries.id, id))
    .run()

  return db.select().from(libraries).where(eq(libraries.id, id)).get()
})
