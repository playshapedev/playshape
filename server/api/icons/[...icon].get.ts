/**
 * Fetches icon SVG data from Iconify API with local caching.
 *
 * Route: GET /api/icons/{collection}/{name}
 * Example: GET /api/icons/lucide/check
 *
 * Returns the raw SVG content for the requested icon.
 * Icons are cached in SQLite for offline access and performance.
 */

import { eq, and } from 'drizzle-orm'
import { iconCache } from '~~/server/database/schema'

// Iconify API base URL
const ICONIFY_API = 'https://api.iconify.design'

// Cache TTL in days
const CACHE_TTL_DAYS = 30

export default defineEventHandler(async (event) => {
  const pathParam = getRouterParam(event, 'icon')

  if (!pathParam) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Icon path required (format: collection/name)',
    })
  }

  // Parse path: can be "lucide/check" or ["lucide", "check"]
  const parts = Array.isArray(pathParam) ? pathParam : pathParam.split('/')

  if (parts.length < 2) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid icon path. Expected format: collection/name',
    })
  }

  // Collection might have multiple parts (e.g., heroicons-outline)
  // Name is always the last part
  const name = parts.pop()!
  const collection = parts.join('-')

  if (!collection || !name) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid icon path. Expected format: collection/name',
    })
  }

  // Sanitize inputs
  if (!/^[a-z0-9-]+$/i.test(collection) || !/^[a-z0-9-]+$/i.test(name)) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid collection or icon name',
    })
  }

  const db = useDb()

  // Check cache first
  const cached = db
    .select()
    .from(iconCache)
    .where(
      and(
        eq(iconCache.collection, collection),
        eq(iconCache.name, name),
      ),
    )
    .get()

  if (cached) {
    // Check if cache is still valid
    const cacheAge = Date.now() - cached.fetchedAt.getTime()
    const maxAge = CACHE_TTL_DAYS * 24 * 60 * 60 * 1000

    if (cacheAge < maxAge) {
      setHeader(event, 'Content-Type', 'image/svg+xml')
      setHeader(event, 'X-Cache', 'HIT')
      return cached.svg
    }
  }

  // Fetch from Iconify API
  const url = `${ICONIFY_API}/${collection}/${name}.svg`

  let svg: string
  try {
    const response = await fetch(url)

    if (!response.ok) {
      if (response.status === 404) {
        throw createError({
          statusCode: 404,
          statusMessage: `Icon not found: ${collection}/${name}`,
        })
      }
      throw new Error(`Iconify API error: ${response.status}`)
    }

    svg = await response.text()

    // Validate it's actually SVG
    if (!svg.includes('<svg')) {
      throw new Error('Invalid SVG response')
    }
  }
  catch (err) {
    // If we have a stale cache entry, return it as fallback
    if (cached) {
      setHeader(event, 'Content-Type', 'image/svg+xml')
      setHeader(event, 'X-Cache', 'STALE')
      return cached.svg
    }

    throw createError({
      statusCode: 502,
      statusMessage: `Failed to fetch icon: ${err instanceof Error ? err.message : 'Unknown error'}`,
    })
  }

  // Cache the result
  if (cached) {
    // Update existing cache entry
    db.update(iconCache)
      .set({
        svg,
        fetchedAt: new Date(),
      })
      .where(
        and(
          eq(iconCache.collection, collection),
          eq(iconCache.name, name),
        ),
      )
      .run()
  }
  else {
    // Insert new cache entry
    db.insert(iconCache)
      .values({
        id: crypto.randomUUID(),
        collection,
        name,
        svg,
        fetchedAt: new Date(),
      })
      .run()
  }

  setHeader(event, 'Content-Type', 'image/svg+xml')
  setHeader(event, 'X-Cache', 'MISS')
  return svg
})
