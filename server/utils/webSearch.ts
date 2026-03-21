/**
 * Web search utility using DuckDuckGo's HTML lite endpoint.
 * No API key required — scrapes the lightweight HTML search page.
 *
 * Uses the same JSDOM dependency already in the stack for parsing.
 */

import { JSDOM } from 'jsdom'

export interface SearchResult {
  title: string
  url: string
  snippet: string
}

export interface SearchResponse {
  success: boolean
  query: string
  results: SearchResult[]
  error?: string
}

/**
 * Search the web via DuckDuckGo's HTML lite endpoint.
 * Returns up to `maxResults` organic search results with title, URL, and snippet.
 */
export async function webSearch(query: string, maxResults = 10): Promise<SearchResponse> {
  try {
    if (!query.trim()) {
      return { success: false, query, results: [], error: 'Empty search query' }
    }

    const params = new URLSearchParams({ q: query })
    const searchUrl = `https://html.duckduckgo.com/html/?${params.toString()}`

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 15000) // 15s timeout

    const response = await fetch(searchUrl, {
      method: 'GET',
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; Playshape/1.0; +https://playshape.app)',
        'Accept': 'text/html',
      },
    })

    clearTimeout(timeout)

    if (!response.ok) {
      return {
        success: false,
        query,
        results: [],
        error: `DuckDuckGo returned HTTP ${response.status}`,
      }
    }

    const html = await response.text()
    const dom = new JSDOM(html)
    const doc = dom.window.document

    const resultElements = doc.querySelectorAll('.result.web-result')
    const results: SearchResult[] = []

    for (const el of resultElements) {
      if (results.length >= maxResults) break

      // Title + URL from the main result link
      const titleLink = el.querySelector('.result__a')
      if (!titleLink) continue

      const title = titleLink.textContent?.trim() ?? ''
      const rawUrl = extractRealUrl(titleLink.getAttribute('href') ?? '')
      if (!rawUrl) continue

      // Snippet from the result snippet element
      const snippetEl = el.querySelector('.result__snippet')
      const snippet = snippetEl?.textContent?.trim() ?? ''

      results.push({ title, url: rawUrl, snippet })
    }

    return { success: true, query, results }
  }
  catch (err) {
    if (err instanceof Error) {
      if (err.name === 'AbortError') {
        return { success: false, query, results: [], error: 'Search request timed out after 15 seconds' }
      }
      return { success: false, query, results: [], error: err.message }
    }
    return { success: false, query, results: [], error: 'Unknown error during web search' }
  }
}

/**
 * Extract the real destination URL from DuckDuckGo's redirect link.
 *
 * DDG links look like: //duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Fpath&rut=...
 * We need the decoded `uddg` parameter value.
 */
function extractRealUrl(href: string): string | null {
  try {
    // DDG uses protocol-relative URLs starting with //
    const fullUrl = href.startsWith('//') ? `https:${href}` : href

    const parsed = new URL(fullUrl)
    const uddg = parsed.searchParams.get('uddg')

    if (uddg) {
      // Validate it's a real HTTP(S) URL
      const realUrl = new URL(uddg)
      if (realUrl.protocol === 'http:' || realUrl.protocol === 'https:') {
        return uddg
      }
    }

    // Fallback: if no uddg param, try the href directly
    if (parsed.protocol === 'http:' || parsed.protocol === 'https:') {
      return fullUrl
    }

    return null
  }
  catch {
    return null
  }
}
