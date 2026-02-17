import { eq } from 'drizzle-orm'
import { join } from 'node:path'
import { writeFileSync } from 'node:fs'
import { z } from 'zod'
import { libraries, documents, documentChunks } from '~~/server/database/schema'
import { cleanupContent } from '~~/server/utils/contentCleanup'

/**
 * Supported file extensions mapped to source type identifiers.
 */
const MIME_TO_SOURCE_TYPE: Record<string, string> = {
  'application/pdf': 'pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
  'text/plain': 'txt',
}

const EXT_TO_SOURCE_TYPE: Record<string, string> = {
  '.pdf': 'pdf',
  '.docx': 'docx',
  '.pptx': 'pptx',
  '.txt': 'txt',
}

const textDocumentSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  content: z.string().min(1, 'Content is required'),
})

export default defineEventHandler(async (event) => {
  const libraryId = getRouterParam(event, 'id')
  if (!libraryId) {
    throw createError({ statusCode: 400, statusMessage: 'Library ID is required' })
  }

  const db = useDb()

  // Verify library exists
  const library = db.select().from(libraries).where(eq(libraries.id, libraryId)).get()
  if (!library) {
    throw createError({ statusCode: 404, statusMessage: 'Library not found' })
  }

  const contentType = getRequestHeader(event, 'content-type') || ''

  // Handle JSON body (plain text paste)
  if (contentType.includes('application/json')) {
    const body = await readBody(event)
    const parsed = textDocumentSchema.parse(body)
    return await processTextDocument(db, libraryId, parsed.title, parsed.content)
  }

  // Handle multipart file upload
  if (contentType.includes('multipart/form-data')) {
    const formData = await readMultipartFormData(event)
    if (!formData || formData.length === 0) {
      throw createError({ statusCode: 400, statusMessage: 'No file uploaded' })
    }

    const file = formData.find(part => part.name === 'file')
    if (!file || !file.data || !file.filename) {
      throw createError({ statusCode: 400, statusMessage: 'No file found in upload' })
    }

    const ext = '.' + file.filename.split('.').pop()?.toLowerCase()
    const sourceType = MIME_TO_SOURCE_TYPE[file.type || ''] || EXT_TO_SOURCE_TYPE[ext] || null

    if (!sourceType) {
      throw createError({
        statusCode: 400,
        statusMessage: `Unsupported file type: ${file.filename}. Supported: PDF, DOCX, PPTX, TXT`,
      })
    }

    return await processFileUpload(db, libraryId, file, sourceType)
  }

  throw createError({ statusCode: 400, statusMessage: 'Invalid content type' })
})

/**
 * Creates a document from pasted text content.
 */
async function processTextDocument(
  db: ReturnType<typeof useDb>,
  libraryId: string,
  title: string,
  content: string,
) {
  const now = new Date()
  const id = crypto.randomUUID()

  // Clean up the content using AI (if enabled)
  const cleanup = await cleanupContent(content, title)
  const finalTitle = cleanup.title || title
  const finalContent = cleanup.text

  // Insert document
  db.insert(documents).values({
    id,
    libraryId,
    title: finalTitle,
    sourceType: 'text',
    body: finalContent,
    status: 'ready',
    createdAt: now,
    updatedAt: now,
  }).run()

  // Chunk the text and generate embeddings
  const chunks = chunkText(finalContent)
  const chunkTexts = chunks.map(c => c.text)
  const embeddings = await generateEmbeddings(chunkTexts)

  for (let i = 0; i < chunks.length; i++) {
    db.insert(documentChunks).values({
      id: crypto.randomUUID(),
      documentId: id,
      libraryId,
      text: chunks[i]!.text,
      chunkIndex: chunks[i]!.index,
      embedding: embeddings[i],
    }).run()
  }

  return db.select().from(documents).where(eq(documents.id, id)).get()
}

/**
 * Processes an uploaded file: stores it on disk, extracts text, chunks it.
 */
async function processFileUpload(
  db: ReturnType<typeof useDb>,
  libraryId: string,
  file: { data: Buffer, filename?: string, type?: string },
  sourceType: string,
) {
  const now = new Date()
  const id = crypto.randomUUID()
  const filename = file.filename || 'unknown'
  const title = filename.replace(/\.[^.]+$/, '') // Strip extension for title

  // Insert document in 'processing' state
  db.insert(documents).values({
    id,
    libraryId,
    title,
    sourceType,
    sourceFilename: filename,
    mimeType: file.type || null,
    fileSize: file.data.length,
    body: '',
    status: 'processing',
    createdAt: now,
    updatedAt: now,
  }).run()

  // Save file to disk
  const uploadDir = getDocumentUploadDir(libraryId, id)
  const filePath = join(uploadDir, filename)
  writeFileSync(filePath, file.data)

  // Extract text
  const extraction = await extractText(file.data, sourceType)

  if (extraction.error) {
    // Update document with error status
    db.update(documents)
      .set({ status: 'error', error: extraction.error, updatedAt: new Date() })
      .where(eq(documents.id, id))
      .run()

    return db.select().from(documents).where(eq(documents.id, id)).get()
  }

  // Clean up the extracted content using AI (if enabled)
  const cleanup = await cleanupContent(extraction.text, title)
  const finalTitle = cleanup.title || title
  const finalContent = cleanup.text

  // Update document with cleaned text and possibly better title
  db.update(documents)
    .set({ title: finalTitle, body: finalContent, status: 'ready', updatedAt: new Date() })
    .where(eq(documents.id, id))
    .run()

  // Chunk the text and generate embeddings
  const chunks = chunkText(finalContent)
  const chunkTexts = chunks.map(c => c.text)
  const embeddings = await generateEmbeddings(chunkTexts)

  for (let i = 0; i < chunks.length; i++) {
    db.insert(documentChunks).values({
      id: crypto.randomUUID(),
      documentId: id,
      libraryId,
      text: chunks[i]!.text,
      chunkIndex: chunks[i]!.index,
      embedding: embeddings[i],
    }).run()
  }

  return db.select().from(documents).where(eq(documents.id, id)).get()
}
