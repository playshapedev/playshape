import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { llmProviders, LLM_PROVIDER_TYPES } from '~~/server/database/schema'

const createProviderSchema = z.object({
  name: z.string().min(1).optional(),
  type: z.enum(LLM_PROVIDER_TYPES),
  baseUrl: z.string().url().optional().nullable(),
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
    db.update(llmProviders)
      .set({ isActive: false, updatedAt: now })
      .run()
  }

  db.insert(llmProviders).values({
    id,
    name: parsed.name || parsed.type,
    type: parsed.type,
    baseUrl: parsed.baseUrl ?? null,
    apiKey: parsed.apiKey ?? null,
    model: parsed.model,
    isActive: parsed.isActive,
    createdAt: now,
    updatedAt: now,
  }).run()

  return db.select().from(llmProviders).where(eq(llmProviders.id, id)).get()
})
