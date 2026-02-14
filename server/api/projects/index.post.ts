import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { projects } from '~~/server/database/schema'

const createProjectSchema = z.object({
  name: z.string().min(1, 'Project name is required'),
  description: z.string().optional().default(''),
})

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const parsed = createProjectSchema.parse(body)

  const db = useDb()
  const now = new Date()
  const id = crypto.randomUUID()

  db.insert(projects).values({
    id,
    name: parsed.name,
    description: parsed.description,
    createdAt: now,
    updatedAt: now,
  }).run()

  return db.select().from(projects).where(eq(projects.id, id)).get()
})
