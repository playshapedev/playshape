import { eq, and, isNotNull } from 'drizzle-orm'
import { libraries, documents, documentChunks } from '~~/server/database/schema'

export default defineEventHandler(async (event) => {
  const libraryId = getRouterParam(event, 'id')
  if (!libraryId) {
    throw createError({ statusCode: 400, statusMessage: 'Library ID is required' })
  }

  const query = getQuery(event)
  const q = (query.q as string || '').trim()
  const limit = Math.min(Number(query.limit) || 10, 50)

  if (!q) {
    throw createError({ statusCode: 400, statusMessage: 'Search query (q) is required' })
  }

  const db = useDb()

  // Verify library exists
  const library = db.select().from(libraries).where(eq(libraries.id, libraryId)).get()
  if (!library) {
    throw createError({ statusCode: 404, statusMessage: 'Library not found' })
  }

  // Generate embedding for the search query
  const queryEmbedding = await generateEmbedding(q)

  // Get all chunks with embeddings in this library
  const chunks = db
    .select({
      id: documentChunks.id,
      documentId: documentChunks.documentId,
      text: documentChunks.text,
      chunkIndex: documentChunks.chunkIndex,
      embedding: documentChunks.embedding,
    })
    .from(documentChunks)
    .where(
      and(
        eq(documentChunks.libraryId, libraryId),
        isNotNull(documentChunks.embedding),
      ),
    )
    .all()

  // Compute cosine similarity for each chunk and rank
  const scored = chunks
    .map((chunk) => {
      const embedding = chunk.embedding as number[] | null
      if (!embedding) return null

      return {
        id: chunk.id,
        documentId: chunk.documentId,
        text: chunk.text,
        chunkIndex: chunk.chunkIndex,
        score: cosineSimilarity(queryEmbedding, embedding),
      }
    })
    .filter((item): item is NonNullable<typeof item> => item !== null)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)

  // Enrich results with document metadata
  const docIds = [...new Set(scored.map(s => s.documentId))]
  const docs = docIds.length > 0
    ? db
        .select({
          id: documents.id,
          title: documents.title,
          sourceType: documents.sourceType,
        })
        .from(documents)
        .where(eq(documents.libraryId, libraryId))
        .all()
    : []

  const docMap = new Map(docs.map(d => [d.id, d]))

  return scored.map(result => ({
    ...result,
    document: docMap.get(result.documentId) || null,
  }))
})
