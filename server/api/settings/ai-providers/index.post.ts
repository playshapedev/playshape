import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { aiProviders, AI_PROVIDER_TYPES } from '~~/server/database/schema'

const createProviderSchema = z.object({
  type: z.enum(AI_PROVIDER_TYPES),
  name: z.string().min(1).optional(),
  baseUrl: z.string().url().optional().nullable(),
  apiKey: z.string().optional().nullable(),
})

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const parsed = createProviderSchema.parse(body)

  const db = useDb()
  const now = new Date()

  // Check if provider type already exists
  const existing = db
    .select()
    .from(aiProviders)
    .where(eq(aiProviders.type, parsed.type))
    .get()

  if (existing) {
    throw createError({
      statusCode: 409,
      statusMessage: `A ${parsed.type} provider already exists. Edit the existing one instead.`,
    })
  }

  const id = crypto.randomUUID()

  db.insert(aiProviders).values({
    id,
    type: parsed.type,
    name: parsed.name || parsed.type,
    baseUrl: parsed.baseUrl ?? null,
    apiKey: parsed.apiKey ?? null,
    createdAt: now,
    updatedAt: now,
  }).run()

  return db.select().from(aiProviders).where(eq(aiProviders.id, id)).get()
})
