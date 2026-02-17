import { aiProviders, aiModels } from '~~/server/database/schema'
import { eq } from 'drizzle-orm'

export default defineEventHandler(() => {
  const db = useDb()

  // Get all providers with their models
  const providers = db.select().from(aiProviders).all()

  return providers.map((provider) => {
    const models = db
      .select()
      .from(aiModels)
      .where(eq(aiModels.providerId, provider.id))
      .all()

    return {
      ...provider,
      models,
    }
  })
})
