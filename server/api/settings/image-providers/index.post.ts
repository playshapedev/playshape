import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { imageProviders, IMAGE_PROVIDER_TYPES } from '~~/server/database/schema'

const createProviderSchema = z.object({
  name: z.string().min(1).optional(),
  type: z.enum(IMAGE_PROVIDER_TYPES),
  apiKey: z.string().optional().nullable(),
  model: z.string().min(1, 'Model is required'),
  isActive: z.boolean().optional().default(false),
})

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const parsed = createProviderSchema.parse(body)

  const db = useDb()
  const now = new Date()
  const id = crypto.randomUUID()

  // If this provider should be active, deactivate all others first
  if (parsed.isActive) {
    db.update(imageProviders)
      .set({ isActive: false, updatedAt: now })
      .run()
  }

  db.insert(imageProviders).values({
    id,
    name: parsed.name || parsed.type,
    type: parsed.type,
    apiKey: parsed.apiKey ?? null,
    model: parsed.model,
    isActive: parsed.isActive,
    createdAt: now,
    updatedAt: now,
  }).run()

  return db.select().from(imageProviders).where(eq(imageProviders.id, id)).get()
})
