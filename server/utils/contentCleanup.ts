import { generateObject } from 'ai'
import { z } from 'zod'
import { useActiveModel } from './llm'
import { getContentCleanupEnabled } from './settings'

const CLEANUP_PROMPT = `You are a document cleanup assistant. Your task is to:

1. Clean up extracted text from documents (PDFs, Word docs, PowerPoints) by removing artifacts
2. Suggest a better document title if the current one is unclear

## Text Cleanup Rules

Remove or fix:
- Page numbers (e.g., "Page 1 of 10", "- 1 -", standalone numbers at paragraph breaks)
- Headers and footers that repeat on every page (e.g., document titles, author names, dates that appear repeatedly)
- Copyright notices and legal boilerplate
- Table of contents entries (unless the document IS a table of contents)
- Running headers/footers
- Watermarks or draft notices
- Excessive whitespace or blank lines
- Broken words from line wraps (rejoin hy-phenated words)
- OCR artifacts and garbled text

Preserve:
- All actual content, paragraphs, and sections
- Meaningful headings and subheadings
- Lists, bullet points, and numbered items
- Code blocks or technical content
- Quotes and citations (the content, not repeated citation markers)

## Title Suggestion Rules

Suggest a better title if the current title:
- Is a filename (e.g., "document_final_v2", "scan001", "IMG_1234")
- Is too generic (e.g., "Document", "Untitled", "New File")
- Doesn't reflect the document's actual content
- Contains file extensions or underscores

If the current title is already good and descriptive, return it unchanged.
The suggested title should be concise (2-8 words), descriptive, and in title case.`

const cleanupSchema = z.object({
  cleanedText: z.string().describe('The cleaned document text with artifacts removed'),
  suggestedTitle: z.string().describe('A better title for the document, or the original if already good'),
})

export interface CleanupResult {
  text: string
  title: string | null // null means keep original
}

/**
 * Cleans up extracted document text using the active LLM provider.
 * Removes page numbers, headers/footers, copyright notices, and other artifacts.
 * Also suggests a better title if the current one is not descriptive.
 *
 * @param text - The raw extracted text to clean up
 * @param currentTitle - The current document title (often derived from filename)
 * @returns The cleaned text and optionally a suggested title
 */
export async function cleanupContent(text: string, currentTitle?: string): Promise<CleanupResult> {
  // Check if cleanup is enabled
  if (!getContentCleanupEnabled()) {
    return { text, title: null }
  }

  // Skip very short texts (not worth cleaning)
  if (text.length < 500) {
    return { text, title: null }
  }

  try {
    const { model } = useActiveModel()

    const prompt = currentTitle
      ? `Current title: "${currentTitle}"\n\nDocument text:\n${text}`
      : `Document text:\n${text}`

    const { object } = await generateObject({
      model,
      schema: cleanupSchema,
      system: CLEANUP_PROMPT,
      prompt,
      maxOutputTokens: Math.min(text.length * 2, 16000), // Generous but bounded
    })

    // Sanity check: if the cleaned text is drastically shorter, something went wrong
    if (object.cleanedText.length < text.length * 0.3) {
      console.warn('[contentCleanup] Cleaned text is suspiciously short, using original')
      return { text, title: null }
    }

    // Only return suggested title if it's different from the current one
    const suggestedTitle = currentTitle && object.suggestedTitle !== currentTitle
      ? object.suggestedTitle
      : null

    return {
      text: object.cleanedText,
      title: suggestedTitle,
    }
  }
  catch (error) {
    // Log but don't fail - return original text if cleanup fails
    console.warn('[contentCleanup] Failed to clean content:', error)
    return { text, title: null }
  }
}
