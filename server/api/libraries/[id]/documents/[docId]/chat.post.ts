import { z } from 'zod'
import { streamText, tool, stepCountIs, convertToModelMessages } from 'ai'
import type { UIMessage } from 'ai'
import { eq } from 'drizzle-orm'
import { documents, libraries } from '~~/server/database/schema'
import { askQuestionTool } from '~~/server/utils/tools/askQuestion'
import { fetchUrl } from '~~/server/utils/webFetch'

export default defineLazyEventHandler(() => {
  return defineEventHandler(async (event) => {
    const libraryId = getRouterParam(event, 'id')
    const docId = getRouterParam(event, 'docId')

    if (!libraryId || !docId) {
      throw createError({ statusCode: 400, statusMessage: 'Library ID and Document ID are required' })
    }

    const body = await readBody(event)
    const messages: UIMessage[] = body?.messages

    if (!messages || !Array.isArray(messages)) {
      throw createError({
        statusCode: 400,
        statusMessage: `Invalid request: expected "messages" array, got ${typeof messages}`,
      })
    }

    // Patch ask_question tool calls that have no result (client-side only tool)
    for (const msg of messages) {
      if (msg.role !== 'assistant') continue
      for (const part of msg.parts) {
        const p = part as Record<string, unknown>
        if (p.type === 'tool-ask_question' && p.state !== 'output-available') {
          p.state = 'output-available'
          p.output = p.output ?? { answered: true }
        }
      }
    }

    const db = useDb()

    // Verify library exists
    const library = db.select().from(libraries).where(eq(libraries.id, libraryId)).get()
    if (!library) {
      throw createError({ statusCode: 404, statusMessage: 'Library not found' })
    }

    // Verify document exists and belongs to this library
    const doc = db.select().from(documents).where(eq(documents.id, docId)).get()
    if (!doc || doc.libraryId !== libraryId) {
      throw createError({ statusCode: 404, statusMessage: 'Document not found' })
    }

    // Load system prompt
    const systemPrompt = await useDocumentGenerationPrompt()

    let model
    try {
      ;({ model } = useActiveModel())
    }
    catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'No active LLM provider configured'
      throw createError({ statusCode: 409, statusMessage: message })
    }

    let convertedMessages
    try {
      convertedMessages = await convertToModelMessages(messages)
    }
    catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to process messages'
      throw createError({ statusCode: 400, statusMessage: message })
    }

    const result = streamText({
      model,
      system: systemPrompt,
      messages: convertedMessages,
      stopWhen: stepCountIs(5),
      tools: {
        ask_question: askQuestionTool,

        fetch_url: tool({
          description: 'Fetch content from a URL. Use this to research topics by retrieving information from web pages. Returns the page title and main text content.',
          inputSchema: z.object({
            url: z.string().url().describe('The URL to fetch content from'),
          }),
          execute: async ({ url }) => {
            const result = await fetchUrl(url)
            if (!result.success) {
              return { success: false, error: result.error }
            }
            return {
              success: true,
              url: result.url,
              title: result.title,
              content: result.content,
            }
          },
        }),

        get_document: tool({
          description: 'Retrieve the current document state including title and content. Call this to see what has been written so far before making changes.',
          inputSchema: z.object({}),
          execute: async () => {
            const current = db.select().from(documents).where(eq(documents.id, docId)).get()
            if (!current) return { error: 'Document not found' }

            // Update last read timestamp for stale context detection
            db.update(documents)
              .set({ contentLastReadAt: new Date() })
              .where(eq(documents.id, docId))
              .run()

            return {
              title: current.title,
              content: current.body,
              summary: current.summary,
            }
          },
        }),

        update_document: tool({
          description: 'Create or replace the entire document content. Use this for initial document creation or major rewrites.',
          inputSchema: z.object({
            title: z.string().describe('Document title'),
            content: z.string().describe('Full document content in Markdown format'),
          }),
          execute: async ({ title, content }) => {
            // Check for stale context (only if there was a previous modification)
            const current = db.select().from(documents).where(eq(documents.id, docId)).get()
            if (!current) return { success: false, error: 'Document not found' }

            if (current.contentLastModifiedAt) {
              const lastMod = current.contentLastModifiedAt.getTime()
              const lastRead = current.contentLastReadAt?.getTime() ?? 0

              if (lastMod > lastRead) {
                return {
                  success: false,
                  error: `Document has been modified since it was last read.\n`
                    + `Last modification: ${current.contentLastModifiedAt.toISOString()}\n`
                    + `Last read: ${current.contentLastReadAt?.toISOString() ?? 'never'}\n\n`
                    + `Please call get_document to read the current state before making changes.`,
                }
              }
            }

            db.update(documents)
              .set({
                title,
                body: content,
                status: 'ready',
                contentLastModifiedAt: new Date(),
                contentLastReadAt: null, // Force re-read before next modification
                updatedAt: new Date(),
              })
              .where(eq(documents.id, docId))
              .run()

            return { success: true, title, contentLength: content.length }
          },
        }),

        patch_document: tool({
          description: 'Apply targeted search-and-replace edits to the existing document. Use this for incremental changes like adding sections, fixing typos, or refining content. Much faster than regenerating the entire document.',
          inputSchema: z.object({
            operations: z.array(z.object({
              search: z.string().describe('Exact string to find in the current document. Must match exactly (including whitespace). Include enough surrounding context to uniquely identify the location.'),
              replace: z.string().describe('The replacement string. Can be empty string to delete the matched text.'),
            })).min(1).describe('Search-and-replace operations to apply sequentially to the document.'),
            title: z.string().optional().describe('Updated document title. Only include if the title needs to change.'),
          }),
          execute: async ({ operations, title }) => {
            const current = db.select().from(documents).where(eq(documents.id, docId)).get()
            if (!current) return { success: false, error: 'Document not found' }

            // Check for stale context
            if (current.contentLastModifiedAt) {
              const lastMod = current.contentLastModifiedAt.getTime()
              const lastRead = current.contentLastReadAt?.getTime() ?? 0

              if (lastMod > lastRead) {
                return {
                  success: false,
                  error: `Document has been modified since it was last read.\n`
                    + `Last modification: ${current.contentLastModifiedAt.toISOString()}\n`
                    + `Last read: ${current.contentLastReadAt?.toISOString() ?? 'never'}\n\n`
                    + `Please call get_document to read the current state before making changes.`,
                }
              }
            }

            let patched = current.body

            // Apply operations sequentially
            for (let i = 0; i < operations.length; i++) {
              const op = operations[i]!
              const { search, replace } = op

              // Count occurrences
              const firstIdx = patched.indexOf(search)
              if (firstIdx === -1) {
                return {
                  success: false,
                  error: `Operation ${i + 1} failed: search string not found in document. Call get_document to see the current content and try again with the exact text.`,
                  currentContent: patched,
                }
              }

              const secondIdx = patched.indexOf(search, firstIdx + 1)
              if (secondIdx !== -1) {
                return {
                  success: false,
                  error: `Operation ${i + 1} failed: search string matches multiple locations. Include more surrounding context to uniquely identify the location.`,
                  currentContent: patched,
                }
              }

              patched = patched.substring(0, firstIdx) + replace + patched.substring(firstIdx + search.length)
            }

            const updatePayload: Record<string, unknown> = {
              body: patched,
              contentLastModifiedAt: new Date(),
              contentLastReadAt: null,
              updatedAt: new Date(),
            }
            if (title) updatePayload.title = title

            db.update(documents)
              .set(updatePayload)
              .where(eq(documents.id, docId))
              .run()

            return { success: true, operationsApplied: operations.length }
          },
        }),
      },
      maxOutputTokens: 16384,
    })

    return result.toUIMessageStreamResponse()
  })
})
