import { eq, and } from 'drizzle-orm'
import { documents, documentChunks } from '~~/server/database/schema'

/**
 * Generates embeddings for a document's content.
 *
 * Clears any existing chunks, re-chunks the body, generates embeddings,
 * and inserts new chunks. Safe to call multiple times (idempotent).
 *
 * Used for lazy embedding of AI-generated documents after editing settles.
 */
export default defineEventHandler(async (event) => {
  const libraryId = getRouterParam(event, 'id')
  const docId = getRouterParam(event, 'docId')

  if (!libraryId || !docId) {
    throw createError({ statusCode: 400, statusMessage: 'Library ID and Document ID are required' })
  }

  const db = useDb()

  // Fetch the document
  const doc = db
    .select()
    .from(documents)
    .where(and(eq(documents.id, docId), eq(documents.libraryId, libraryId)))
    .get()

  if (!doc) {
    throw createError({ statusCode: 404, statusMessage: 'Document not found' })
  }

  // Skip if body is empty
  if (!doc.body || !doc.body.trim()) {
    return { success: true, skipped: true, reason: 'empty_body' }
  }

  // Delete existing chunks for this document
  db.delete(documentChunks)
    .where(eq(documentChunks.documentId, docId))
    .run()

  // Chunk the text
  const chunks = chunkText(doc.body)

  if (!chunks.length) {
    return { success: true, skipped: true, reason: 'no_chunks' }
  }

  // Generate embeddings
  const chunkTexts = chunks.map(c => c.text)
  const embeddings = await generateEmbeddings(chunkTexts)

  // Insert new chunks
  for (let i = 0; i < chunks.length; i++) {
    db.insert(documentChunks).values({
      id: crypto.randomUUID(),
      documentId: docId,
      libraryId,
      text: chunks[i]!.text,
      chunkIndex: chunks[i]!.index,
      embedding: embeddings[i],
    }).run()
  }

  return { success: true, chunksCreated: chunks.length }
})
