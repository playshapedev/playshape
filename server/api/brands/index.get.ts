import { brands } from '~~/server/database/schema'
import { asc } from 'drizzle-orm'

export default defineEventHandler(() => {
  const db = useDb()
  return db.select().from(brands).orderBy(asc(brands.createdAt)).all()
})
