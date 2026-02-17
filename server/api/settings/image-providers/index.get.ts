import { imageProviders } from '~~/server/database/schema'

export default defineEventHandler(() => {
  const db = useDb()
  return db.select().from(imageProviders).all()
})
