import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { projects, libraries, projectLibraries } from '~~/server/database/schema'

const linkLibrarySchema = z.object({
  libraryId: z.string().min(1, 'Library ID is required'),
})

export default defineEventHandler(async (event) => {
  const projectId = getRouterParam(event, 'id')
  if (!projectId) {
    throw createError({ statusCode: 400, statusMessage: 'Project ID is required' })
  }

  const body = await readBody(event)
  const parsed = linkLibrarySchema.parse(body)

  const db = useDb()

  // Verify project exists
  const project = db.select().from(projects).where(eq(projects.id, projectId)).get()
  if (!project) {
    throw createError({ statusCode: 404, statusMessage: 'Project not found' })
  }

  // Verify library exists
  const library = db.select().from(libraries).where(eq(libraries.id, parsed.libraryId)).get()
  if (!library) {
    throw createError({ statusCode: 404, statusMessage: 'Library not found' })
  }

  // Insert link (ignore if already exists)
  db.insert(projectLibraries)
    .values({
      projectId,
      libraryId: parsed.libraryId,
      linkedAt: new Date(),
    })
    .onConflictDoNothing()
    .run()

  return { projectId, libraryId: parsed.libraryId, linked: true }
})
