import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { templates } from '~~/server/database/schema'

const createTemplateSchema = z.object({
  name: z.string().min(1, 'Template name is required'),
  description: z.string().optional().default(''),
})

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const parsed = createTemplateSchema.parse(body)

  const db = useDb()
  const now = new Date()
  const id = crypto.randomUUID()

  db.insert(templates).values({
    id,
    name: parsed.name,
    description: parsed.description,
    status: 'draft',
    createdAt: now,
    updatedAt: now,
  }).run()

  return db.select().from(templates).where(eq(templates.id, id)).get()
})
