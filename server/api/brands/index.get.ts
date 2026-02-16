import { brands } from '~~/server/database/schema'
import { desc } from 'drizzle-orm'

export default defineEventHandler(() => {
  const db = useDb()
  return db.select().from(brands).orderBy(desc(brands.updatedAt)).all()
})
