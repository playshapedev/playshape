import { z } from 'zod'
import { generateStructuredOutput } from './structuredOutput'
import { getContentCleanupEnabled } from './settings'
import { useContentCleanupPrompts } from './prompts'

const chunkCleanupSchema = z.object({
  cleanedText: z.string().describe('The cleaned text chunk with artifacts removed'),
})

const metadataSchema = z.object({
  suggestedTitle: z.string().describe('A better title for the document, or the original if already good'),
  summary: z.string().describe('A 2-4 sentence summary of the document content'),
})

export interface CleanupResult {
  text: string
  title: string | null // null means keep original
  summary: string | null // null if cleanup disabled or failed
}

// Target chunk size in characters (~4k tokens input, leaving room for output)
// Rough estimate: 1 token ≈ 4 chars
const CHUNK_SIZE_CHARS = 12000

// Overlap between chunks to avoid cutting sentences/paragraphs awkwardly
const CHUNK_OVERLAP_CHARS = 500

/**
 * Splits text into chunks at paragraph boundaries.
 */
function chunkText(text: string): string[] {
  if (text.length <= CHUNK_SIZE_CHARS) {
    return [text]
  }

  const chunks: string[] = []
  let start = 0

  while (start < text.length) {
    let end = start + CHUNK_SIZE_CHARS

    // If we're not at the end, try to break at a paragraph
    if (end < text.length) {
      // Look for paragraph break (double newline) near the end of the chunk
      const searchStart = Math.max(start + CHUNK_SIZE_CHARS - 1000, start)
      const searchRegion = text.slice(searchStart, end)
      const lastParagraph = searchRegion.lastIndexOf('\n\n')

      if (lastParagraph !== -1) {
        end = searchStart + lastParagraph + 2 // Include the newlines
      }
      else {
        // Fall back to single newline
        const lastNewline = searchRegion.lastIndexOf('\n')
        if (lastNewline !== -1) {
          end = searchStart + lastNewline + 1
        }
      }
    }

    chunks.push(text.slice(start, end))

    // Move start, accounting for overlap
    start = end - CHUNK_OVERLAP_CHARS
    if (start < 0) start = 0
    // Make sure we make progress
    const minProgress = chunks.length > 1 ? end - CHUNK_SIZE_CHARS : 0
    if (start <= minProgress) {
      start = end
    }
  }

  return chunks
}

/**
 * Cleans up extracted document text using the active LLM provider.
 * For large documents, splits into chunks, cleans each, then combines.
 * Also generates a title suggestion and summary.
 *
 * @param text - The raw extracted text to clean up
 * @param currentTitle - The current document title (often derived from filename)
 * @returns The cleaned text, optionally a suggested title, and a summary
 */
export async function cleanupContent(text: string, currentTitle?: string): Promise<CleanupResult> {
  // Check if cleanup is enabled
  if (!getContentCleanupEnabled()) {
    return { text, title: null, summary: null }
  }

  // Skip very short texts (not worth cleaning)
  if (text.length < 500) {
    return { text, title: null, summary: null }
  }

  try {
    // Load prompts from file
    const prompts = await useContentCleanupPrompts()

    // Split text into chunks
    const chunks = chunkText(text)
    console.log(`[contentCleanup] Processing ${chunks.length} chunk(s)`)

    // Clean each chunk
    const cleanedChunks: string[] = []
    for (let i = 0; i < chunks.length; i++) {
      console.log(`[contentCleanup] Cleaning chunk ${i + 1}/${chunks.length}`)
      const result = await generateStructuredOutput({
        schema: chunkCleanupSchema,
        system: prompts.chunkCleanup,
        prompt: `Text chunk ${i + 1} of ${chunks.length}:\n\n${chunks[i]}`,
      })
      cleanedChunks.push(result.cleanedText)
    }

    // Combine cleaned chunks (remove overlap by deduping at boundaries)
    const cleanedText = combineChunks(cleanedChunks)

    // Generate title and summary from the cleaned text
    // Use first ~8k chars for context (should be enough to understand the doc)
    const contextForMetadata = cleanedText.slice(0, 8000)
    const userPrompt = currentTitle
      ? `Current title: "${currentTitle}"\n\nDocument text:\n${contextForMetadata}`
      : `Document text:\n${contextForMetadata}`

    console.log(`[contentCleanup] Generating title and summary`)
    const metadata = await generateStructuredOutput({
      schema: metadataSchema,
      system: prompts.metadata,
      prompt: userPrompt,
    })

    // Only return suggested title if it's different from the current one
    const suggestedTitle = currentTitle && metadata.suggestedTitle !== currentTitle
      ? metadata.suggestedTitle
      : null

    return {
      text: cleanedText,
      title: suggestedTitle,
      summary: metadata.summary,
    }
  }
  catch (error) {
    // Log but don't fail - return original text if cleanup fails
    console.warn('[contentCleanup] Failed to clean content:', error)
    return { text, title: null, summary: null }
  }
}

/**
 * Combines cleaned chunks, attempting to remove duplicate content from overlaps.
 */
function combineChunks(chunks: string[]): string {
  if (chunks.length === 0) {
    return ''
  }

  if (chunks.length === 1) {
    return chunks[0]!
  }

  let combined = chunks[0]!

  for (let i = 1; i < chunks.length; i++) {
    const current = chunks[i]!

    // Try to find where the overlap ends by looking for common text
    // Check the last ~200 chars of combined against start of current
    const overlapSearchLen = Math.min(300, combined.length, current.length)
    const endOfPrevious = combined.slice(-overlapSearchLen)

    // Find the best match point
    let bestMatchLen = 0
    for (let matchLen = 20; matchLen <= overlapSearchLen; matchLen++) {
      const searchStr = endOfPrevious.slice(-matchLen)
      if (current.startsWith(searchStr)) {
        bestMatchLen = matchLen
      }
    }

    if (bestMatchLen > 0) {
      // Skip the overlapping part
      combined += current.slice(bestMatchLen)
    }
    else {
      // No overlap found, just append with a newline
      combined += '\n' + current
    }
  }

  return combined
}
