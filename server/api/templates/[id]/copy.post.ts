import { eq } from 'drizzle-orm'
import { templates, templateVersions } from '~~/server/database/schema'
import type { TemplateField, TemplateDependency } from '~~/server/database/schema'

/**
 * POST /api/templates/:id/copy
 *
 * Creates an editable user copy of any template (typically a default).
 * The copy gets a new ID, source='user', clean chat history, draft status,
 * and resets to schema version 1.
 */
export default defineEventHandler((event) => {
  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Template ID is required' })
  }

  const db = useDb()

  const source = db.select().from(templates).where(eq(templates.id, id)).get()
  if (!source) {
    throw createError({ statusCode: 404, statusMessage: 'Template not found' })
  }

  const now = new Date()
  const newId = crypto.randomUUID()

  // Create the user copy — clean slate for chat, tokens, and timestamps
  db.insert(templates).values({
    id: newId,
    kind: source.kind,
    source: 'user',
    sourceSlug: null,
    name: source.name,
    description: source.description || '',
    inputSchema: source.inputSchema as TemplateField[] | null,
    component: source.component,
    sampleData: source.sampleData as Record<string, unknown> | null,
    dependencies: source.dependencies as TemplateDependency[] | null,
    tools: source.tools as string[] | null,
    schemaVersion: 1,
    messages: null,
    thumbnail: null,
    status: 'draft',
    componentLastReadAt: null,
    componentLastModifiedAt: null,
    totalPromptTokens: 0,
    totalCompletionTokens: 0,
    totalTokens: 0,
    createdAt: now,
    updatedAt: now,
  }).run()

  // Create initial v1 version snapshot with the copied content
  db.insert(templateVersions).values({
    id: crypto.randomUUID(),
    templateId: newId,
    version: 1,
    inputSchema: source.inputSchema as TemplateField[] | null,
    component: source.component,
    sampleData: source.sampleData as Record<string, unknown> | null,
    dependencies: source.dependencies as TemplateDependency[] | null,
    tools: source.tools as string[] | null,
    createdAt: now,
  }).run()

  return db.select().from(templates).where(eq(templates.id, newId)).get()
})
