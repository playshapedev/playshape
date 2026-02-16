import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { brands } from '~~/server/database/schema'

const createBrandSchema = z.object({
  name: z.string().min(1, 'Brand name is required'),
  primaryColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional().default('#7458f5'),
  neutralColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional().default('#64748b'),
  accentColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional().default('#3b82f6'),
  fontFamily: z.string().optional().default('Poppins'),
  fontSource: z.enum(['google', 'system']).optional().default('google'),
  baseFontSize: z.number().int().min(10).max(28).optional().default(16),
  typeScaleRatio: z.string().optional().default('1.25'),
  borderRadius: z.string().optional().default('0.325'),
})

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const parsed = createBrandSchema.parse(body)

  const db = useDb()
  const now = new Date()
  const id = crypto.randomUUID()

  // Auto-set as default if this is the first brand
  const existingCount = db.select().from(brands).all().length
  const isDefault = existingCount === 0

  db.insert(brands).values({
    id,
    ...parsed,
    isDefault,
    createdAt: now,
    updatedAt: now,
  }).run()

  return db.select().from(brands).where(eq(brands.id, id)).get()
})
