export interface TextChunk {
  text: string
  index: number
}

/**
 * Splits text into chunks suitable for embedding.
 *
 * Strategy:
 * 1. Split on double newlines (paragraphs)
 * 2. If a paragraph exceeds the target, split on single newlines
 * 3. If still too large, split on sentence boundaries
 * 4. Merge small consecutive chunks to meet the minimum size
 *
 * @param text - The full text to chunk
 * @param targetSize - Target chunk size in characters (~500 tokens ≈ 2000 chars)
 * @param minSize - Minimum chunk size before merging with neighbors
 * @param overlap - Number of characters to overlap between chunks
 */
export function chunkText(
  text: string,
  targetSize = 2000,
  minSize = 200,
  overlap = 200,
): TextChunk[] {
  if (!text || text.trim().length === 0) {
    return []
  }

  // Step 1: Split into paragraphs
  const paragraphs = text.split(/\n\s*\n/).filter(p => p.trim().length > 0)

  // Step 2: Split oversized paragraphs further
  const segments: string[] = []
  for (const paragraph of paragraphs) {
    if (paragraph.length <= targetSize) {
      segments.push(paragraph.trim())
    }
    else {
      // Try splitting on single newlines
      const lines = paragraph.split(/\n/).filter(l => l.trim().length > 0)
      for (const line of lines) {
        if (line.length <= targetSize) {
          segments.push(line.trim())
        }
        else {
          // Split on sentence boundaries
          const sentences = splitSentences(line)
          segments.push(...sentences)
        }
      }
    }
  }

  // Step 3: Merge small segments and build chunks with overlap
  const chunks: TextChunk[] = []
  let currentChunk = ''
  let chunkIndex = 0

  for (const segment of segments) {
    if (currentChunk.length === 0) {
      currentChunk = segment
    }
    else if (currentChunk.length + segment.length + 1 <= targetSize) {
      currentChunk += '\n\n' + segment
    }
    else {
      // Current chunk is full, emit it
      if (currentChunk.trim().length >= minSize) {
        chunks.push({ text: currentChunk.trim(), index: chunkIndex++ })
      }

      // Start new chunk with overlap from the end of the previous
      if (overlap > 0 && currentChunk.length > overlap) {
        const overlapText = getOverlapText(currentChunk, overlap)
        currentChunk = overlapText + '\n\n' + segment
      }
      else {
        currentChunk = segment
      }
    }
  }

  // Don't forget the last chunk
  if (currentChunk.trim().length > 0) {
    // If it's tiny and we have previous chunks, merge with the last one
    if (currentChunk.trim().length < minSize && chunks.length > 0) {
      const lastChunk = chunks[chunks.length - 1]!
      lastChunk.text += '\n\n' + currentChunk.trim()
    }
    else {
      chunks.push({ text: currentChunk.trim(), index: chunkIndex })
    }
  }

  return chunks
}

/**
 * Split text into sentences, trying to keep them whole.
 */
function splitSentences(text: string): string[] {
  // Split on sentence-ending punctuation followed by whitespace
  const sentences = text.split(/(?<=[.!?])\s+/)
  return sentences.filter(s => s.trim().length > 0).map(s => s.trim())
}

/**
 * Get the last N characters of text, breaking at a word boundary.
 */
function getOverlapText(text: string, maxLength: number): string {
  const end = text.slice(-maxLength)
  // Try to start at a word boundary
  const wordBoundary = end.indexOf(' ')
  if (wordBoundary > 0 && wordBoundary < end.length / 2) {
    return end.slice(wordBoundary + 1)
  }
  return end
}
