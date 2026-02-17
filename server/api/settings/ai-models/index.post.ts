import { z } from 'zod'
import { eq, and } from 'drizzle-orm'
import { aiModels, aiProviders, AI_MODEL_PURPOSES } from '~~/server/database/schema'

const createModelSchema = z.object({
  providerId: z.string().uuid(),
  modelId: z.string().min(1),
  name: z.string().min(1),
  purpose: z.enum(AI_MODEL_PURPOSES),
  isActive: z.boolean().optional().default(false),
})

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const parsed = createModelSchema.parse(body)

  const db = useDb()
  const now = new Date()

  // Verify provider exists
  const provider = db
    .select()
    .from(aiProviders)
    .where(eq(aiProviders.id, parsed.providerId))
    .get()

  if (!provider) {
    throw createError({
      statusCode: 404,
      statusMessage: 'Provider not found',
    })
  }

  // Check if this model already exists for this provider
  const existing = db
    .select()
    .from(aiModels)
    .where(
      and(
        eq(aiModels.providerId, parsed.providerId),
        eq(aiModels.modelId, parsed.modelId),
      ),
    )
    .get()

  if (existing) {
    throw createError({
      statusCode: 409,
      statusMessage: 'This model is already enabled for this provider',
    })
  }

  const id = crypto.randomUUID()

  // If this model should be active, deactivate others with same purpose
  if (parsed.isActive) {
    db.update(aiModels)
      .set({ isActive: false, updatedAt: now })
      .where(eq(aiModels.purpose, parsed.purpose))
      .run()
  }

  db.insert(aiModels).values({
    id,
    providerId: parsed.providerId,
    modelId: parsed.modelId,
    name: parsed.name,
    purpose: parsed.purpose,
    isActive: parsed.isActive,
    createdAt: now,
    updatedAt: now,
  }).run()

  return db.select().from(aiModels).where(eq(aiModels.id, id)).get()
})
