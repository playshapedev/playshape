import { eq } from 'drizzle-orm'
import { join } from 'node:path'
import { writeFileSync, mkdirSync, existsSync } from 'node:fs'
import { templates } from '~~/server/database/schema'
import type { TemplateField, TemplateDependency } from '~~/server/database/schema'

/**
 * POST /api/dev/export-default/:id?slug=custom-slug
 *
 * Dev-only route that exports a template to a JSON fixture file
 * in server/database/defaults/templates/{kind}/{slug}.json.
 *
 * This allows developers to build a template in the UI and then
 * promote it to a bundled default.
 */
export default defineEventHandler(async (event) => {
  // Only available in development
  if (process.env.NODE_ENV === 'production') {
    throw createError({ statusCode: 404, statusMessage: 'Not found' })
  }

  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Template ID is required' })
  }

  const query = getQuery(event)
  const slugOverride = query.slug as string | undefined

  const db = useDb()

  const tmpl = db.select().from(templates).where(eq(templates.id, id)).get()
  if (!tmpl) {
    throw createError({ statusCode: 404, statusMessage: 'Template not found' })
  }

  // Derive slug from the override, existing sourceSlug, or the template name
  const slug = slugOverride
    || tmpl.sourceSlug
    || tmpl.name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '')

  if (!slug) {
    throw createError({ statusCode: 400, statusMessage: 'Could not derive a slug. Provide one via ?slug= query parameter.' })
  }

  // Build the fixture object (only the fields needed for defaults)
  const fixture = {
    slug,
    kind: tmpl.kind,
    name: tmpl.name,
    description: tmpl.description || '',
    inputSchema: tmpl.inputSchema as TemplateField[] | null,
    component: tmpl.component,
    sampleData: tmpl.sampleData as Record<string, unknown> | null,
    dependencies: tmpl.dependencies as TemplateDependency[] | null,
    tools: tmpl.tools as string[] | null,
    thumbnail: tmpl.thumbnail,
  }

  // Write to the defaults directory
  const defaultsBase = join(process.cwd(), 'server', 'database', 'defaults', 'templates', tmpl.kind)

  if (!existsSync(defaultsBase)) {
    mkdirSync(defaultsBase, { recursive: true })
  }

  const filePath = join(defaultsBase, `${slug}.json`)
  writeFileSync(filePath, JSON.stringify(fixture, null, 2) + '\n', 'utf-8')

  // Also mark the template in the DB as a default so it's recognized on next restart
  db.update(templates)
    .set({
      source: 'default',
      sourceSlug: slug,
      updatedAt: new Date(),
    })
    .where(eq(templates.id, id))
    .run()

  return {
    ok: true,
    slug,
    kind: tmpl.kind,
    filePath,
    message: `Template exported to ${filePath}. It will be loaded as a default on next app restart.`,
  }
})
