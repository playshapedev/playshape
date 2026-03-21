import { z } from 'zod'
import { tool } from 'ai'
import { webSearch } from '~~/server/utils/webSearch'

/**
 * Reusable AI SDK tool for web search via DuckDuckGo.
 * Returns titles, URLs, and snippets. Pair with fetch_url to drill into results.
 *
 * No API key required — works out of the box.
 */
export const webSearchTool = tool({
  description: 'Search the web using DuckDuckGo. Returns a list of results with titles, URLs, and snippets. Use this to find information on a topic, then use fetch_url to read the full content of promising results.',
  inputSchema: z.object({
    query: z.string().describe('The search query. Use natural language or keywords.'),
    maxResults: z.number().optional().default(8).describe('Maximum number of results to return (default 8, max 20)'),
  }),
  execute: async ({ query, maxResults }) => {
    const safeMax = Math.min(maxResults ?? 8, 20)
    const response = await webSearch(query, safeMax)

    if (!response.success) {
      return { success: false, error: response.error }
    }

    return {
      success: true,
      query: response.query,
      resultCount: response.results.length,
      results: response.results.map(r => ({
        title: r.title,
        url: r.url,
        snippet: r.snippet,
      })),
    }
  },
})
