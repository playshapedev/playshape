import { templates } from '~~/server/database/schema'
import { desc, eq } from 'drizzle-orm'

export default defineEventHandler((event) => {
  const query = getQuery(event)
  const kind = query.kind as string | undefined

  const db = useDb()
  const q = db.select().from(templates).orderBy(desc(templates.updatedAt))

  if (kind === 'activity' || kind === 'interface') {
    return q.where(eq(templates.kind, kind)).all()
  }

  return q.all()
})
