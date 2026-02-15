import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { libraries } from '~~/server/database/schema'

const createLibrarySchema = z.object({
  name: z.string().min(1, 'Library name is required'),
  description: z.string().optional().default(''),
})

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const parsed = createLibrarySchema.parse(body)

  const db = useDb()
  const now = new Date()
  const id = crypto.randomUUID()

  db.insert(libraries).values({
    id,
    name: parsed.name,
    description: parsed.description,
    createdAt: now,
    updatedAt: now,
  }).run()

  return db.select().from(libraries).where(eq(libraries.id, id)).get()
})
