import { templates } from '~~/server/database/schema'
import { desc } from 'drizzle-orm'

export default defineEventHandler(() => {
  const db = useDb()
  return db.select().from(templates).orderBy(desc(templates.updatedAt)).all()
})
