/**
 * Web fetch utility for retrieving content from URLs.
 * Used by the document generation chat to allow the LLM to research topics.
 */

import { JSDOM } from 'jsdom'
import { Readability } from '@mozilla/readability'

interface FetchResult {
  success: boolean
  url: string
  title?: string
  content?: string
  error?: string
}

/**
 * Fetch a URL and extract its main content as clean text.
 * Uses Mozilla's Readability library to extract article content.
 */
export async function fetchUrl(url: string): Promise<FetchResult> {
  try {
    // Validate URL
    const parsed = new URL(url)
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return { success: false, url, error: 'Only HTTP/HTTPS URLs are supported' }
    }

    // Fetch with timeout
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 30000) // 30s timeout

    const response = await fetch(url, {
      signal: controller.signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; Playshape/1.0; +https://playshape.app)',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
      },
    })

    clearTimeout(timeout)

    if (!response.ok) {
      return { success: false, url, error: `HTTP ${response.status}: ${response.statusText}` }
    }

    const contentType = response.headers.get('content-type') || ''

    // Handle plain text
    if (contentType.includes('text/plain')) {
      const text = await response.text()
      return {
        success: true,
        url,
        title: parsed.hostname,
        content: text.slice(0, 50000), // Limit to ~50KB
      }
    }

    // Handle HTML
    if (contentType.includes('text/html') || contentType.includes('application/xhtml')) {
      const html = await response.text()

      // Use Readability to extract main content
      const dom = new JSDOM(html, { url })
      const reader = new Readability(dom.window.document)
      const article = reader.parse()

      if (article && article.textContent) {
        return {
          success: true,
          url,
          title: article.title || parsed.hostname,
          content: article.textContent.slice(0, 50000), // Limit to ~50KB
        }
      }

      // Fallback: extract body text if Readability fails
      const body = dom.window.document.body
      const text = body?.textContent?.replace(/\s+/g, ' ').trim() || ''
      const title = dom.window.document.title || parsed.hostname

      return {
        success: true,
        url,
        title,
        content: text.slice(0, 50000),
      }
    }

    // Unsupported content type
    return {
      success: false,
      url,
      error: `Unsupported content type: ${contentType}. Only HTML and plain text are supported.`,
    }
  }
  catch (err) {
    if (err instanceof Error) {
      if (err.name === 'AbortError') {
        return { success: false, url, error: 'Request timed out after 30 seconds' }
      }
      return { success: false, url, error: err.message }
    }
    return { success: false, url, error: 'Unknown error occurred' }
  }
}

/**
 * Fetch multiple URLs in parallel with rate limiting.
 */
export async function fetchUrls(urls: string[], maxConcurrent = 3): Promise<FetchResult[]> {
  const results: FetchResult[] = []

  // Process in batches
  for (let i = 0; i < urls.length; i += maxConcurrent) {
    const batch = urls.slice(i, i + maxConcurrent)
    const batchResults = await Promise.all(batch.map(fetchUrl))
    results.push(...batchResults)

    // Small delay between batches to be polite
    if (i + maxConcurrent < urls.length) {
      await new Promise(resolve => setTimeout(resolve, 500))
    }
  }

  return results
}
