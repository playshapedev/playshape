import { llmProviders } from '~~/server/database/schema'

export default defineEventHandler(() => {
  const db = useDb()
  return db.select().from(llmProviders).all()
})
