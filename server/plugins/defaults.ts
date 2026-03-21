import { eq } from 'drizzle-orm'
import { join } from 'node:path'
import { readdirSync, readFileSync, existsSync } from 'node:fs'
import { templates, templateVersions, TEMPLATE_KINDS } from '~~/server/database/schema'
import type { TemplateKind, TemplateField, TemplateDependency } from '~~/server/database/schema'

interface DefaultTemplateFixture {
  slug: string
  kind: TemplateKind
  name: string
  description: string
  inputSchema: TemplateField[] | null
  component: string | null
  sampleData: Record<string, unknown> | null
  dependencies?: TemplateDependency[] | null
  tools?: string[] | null
  thumbnail?: string | null
}

/**
 * Seeds and updates default templates from bundled JSON fixture files.
 *
 * Runs after the database plugin (Nitro loads plugins in filename order,
 * and "defaults" sorts after "database").
 *
 * - New defaults (slug not yet in DB) are inserted.
 * - Existing defaults are updated with the latest fixture data.
 * - Defaults whose fixture file has been removed are deleted.
 */
export default defineNitroPlugin(() => {
  const db = useDb()

  // Resolve the defaults directory.
  // In production (Electron), bundled via extraResources.
  // In development, read from the project source directory.
  const defaultsBase = process.env.PLAYSHAPE_DEFAULTS_PATH
    || join(process.cwd(), 'server', 'database', 'defaults')

  const templatesDir = join(defaultsBase, 'templates')

  if (!existsSync(templatesDir)) {
    console.log('[defaults] No templates directory found, skipping')
    return
  }

  const allSlugs: string[] = []

  for (const kind of TEMPLATE_KINDS) {
    const kindDir = join(templatesDir, kind)
    if (!existsSync(kindDir)) continue

    const files = readdirSync(kindDir).filter(f => f.endsWith('.json'))

    for (const file of files) {
      try {
        const raw = readFileSync(join(kindDir, file), 'utf-8')
        const fixture: DefaultTemplateFixture = JSON.parse(raw)

        // Ensure the kind from the directory matches
        fixture.kind = kind

        // Derive slug from filename if not in the fixture
        if (!fixture.slug) {
          fixture.slug = file.replace(/\.json$/, '')
        }

        allSlugs.push(fixture.slug)

        // Check if this default already exists
        const existing = db
          .select()
          .from(templates)
          .where(eq(templates.sourceSlug, fixture.slug))
          .get()

        const now = new Date()

        if (!existing) {
          // Insert new default template
          const id = crypto.randomUUID()

          db.insert(templates).values({
            id,
            kind: fixture.kind,
            source: 'default',
            sourceSlug: fixture.slug,
            name: fixture.name,
            description: fixture.description || '',
            inputSchema: fixture.inputSchema,
            component: fixture.component,
            sampleData: fixture.sampleData,
            dependencies: fixture.dependencies || null,
            tools: fixture.tools || null,
            thumbnail: fixture.thumbnail || null,
            schemaVersion: 1,
            status: 'published',
            createdAt: now,
            updatedAt: now,
          }).run()

          // Create initial v1 version snapshot
          db.insert(templateVersions).values({
            id: crypto.randomUUID(),
            templateId: id,
            version: 1,
            inputSchema: fixture.inputSchema,
            component: fixture.component,
            sampleData: fixture.sampleData,
            dependencies: fixture.dependencies || null,
            tools: fixture.tools || null,
            createdAt: now,
          }).run()

          console.log(`[defaults] Inserted default template: ${fixture.name} (${fixture.slug})`)
        }
        else {
          // Update existing default template with latest fixture data
          db.update(templates)
            .set({
              kind: fixture.kind,
              name: fixture.name,
              description: fixture.description || '',
              inputSchema: fixture.inputSchema,
              component: fixture.component,
              sampleData: fixture.sampleData,
              dependencies: fixture.dependencies || null,
              tools: fixture.tools || null,
              thumbnail: fixture.thumbnail || null,
              status: 'published',
              updatedAt: now,
            })
            .where(eq(templates.id, existing.id))
            .run()

          // Update the current version snapshot
          db.update(templateVersions)
            .set({
              inputSchema: fixture.inputSchema,
              component: fixture.component,
              sampleData: fixture.sampleData,
              dependencies: fixture.dependencies || null,
              tools: fixture.tools || null,
            })
            .where(eq(templateVersions.templateId, existing.id))
            .run()

          console.log(`[defaults] Updated default template: ${fixture.name} (${fixture.slug})`)
        }
      }
      catch (err) {
        console.error(`[defaults] Failed to process ${file}:`, err)
      }
    }
  }

  // Remove default templates whose fixture file no longer exists
  const orphans = db
    .select({ id: templates.id, name: templates.name, sourceSlug: templates.sourceSlug })
    .from(templates)
    .where(eq(templates.source, 'default'))
    .all()

  for (const orphan of orphans) {
    if (orphan.sourceSlug && !allSlugs.includes(orphan.sourceSlug)) {
      db.delete(templates).where(eq(templates.id, orphan.id)).run()
      console.log(`[defaults] Removed orphaned default template: ${orphan.name} (${orphan.sourceSlug})`)
    }
  }

  console.log('[defaults] Default templates synced')
})
