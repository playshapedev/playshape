import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { brands } from '~~/server/database/schema'

const updateBrandSchema = z.object({
  name: z.string().min(1).optional(),
  primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  neutralColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
  fontFamily: z.string().optional(),
  fontSource: z.enum(['google', 'system']).optional(),
  baseFontSize: z.number().int().min(10).max(28).optional(),
  typeScaleRatio: z.string().optional(),
  borderRadius: z.string().optional(),
})

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Brand ID is required' })
  }

  const body = await readBody(event)
  const parsed = updateBrandSchema.parse(body)

  const db = useDb()

  const existing = db.select().from(brands).where(eq(brands.id, id)).get()
  if (!existing) {
    throw createError({ statusCode: 404, statusMessage: 'Brand not found' })
  }

  db.update(brands)
    .set({
      ...parsed,
      updatedAt: new Date(),
    })
    .where(eq(brands.id, id))
    .run()

  return db.select().from(brands).where(eq(brands.id, id)).get()
})
