import { projects } from '~~/server/database/schema'

export default defineEventHandler(() => {
  const db = useDb()
  return db.select().from(projects).all()
})
