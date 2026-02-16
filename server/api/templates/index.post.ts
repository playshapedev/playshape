import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { templates, TEMPLATE_KINDS } from '~~/server/database/schema'

const createTemplateSchema = z.object({
  name: z.string().min(1, 'Template name is required'),
  description: z.string().optional().default(''),
  kind: z.enum(TEMPLATE_KINDS).optional().default('activity'),
})

export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const parsed = createTemplateSchema.parse(body)

  const db = useDb()
  const now = new Date()
  const id = crypto.randomUUID()

  db.insert(templates).values({
    id,
    kind: parsed.kind,
    name: parsed.name,
    description: parsed.description,
    status: 'draft',
    createdAt: now,
    updatedAt: now,
  }).run()

  return db.select().from(templates).where(eq(templates.id, id)).get()
})
