/**
 * Serves pre-built Nuxt UI component files for the template preview iframe.
 *
 * In development: Serves from resources/nuxt-ui/ in the project root.
 * In production (Electron): Serves from process.resourcesPath/nuxt-ui/.
 *
 * This route serves:
 *   - /nuxt-ui/manifest.json — Component metadata and dependency graph
 *   - /nuxt-ui/shared.js — Common runtime dependencies
 *   - /nuxt-ui/vue.js — Vue ESM shim (re-exports from window.Vue)
 *   - /nuxt-ui/*.js — Individual component modules (e.g., Button.js, Card.js)
 *   - /nuxt-ui/style.css — Component styles (minimal, Tailwind is loaded via CDN)
 *   - /nuxt-ui/version.txt — Version for staleness detection
 */

import { join } from 'node:path'
import { readFile, access } from 'node:fs/promises'
import { constants } from 'node:fs'

// Content types for served files
const CONTENT_TYPES: Record<string, string> = {
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
}

// Allowed file extensions (security: prevent serving arbitrary files)
const ALLOWED_EXTENSIONS = new Set(['.js', '.css', '.json', '.txt'])

/**
 * Get the base path for Nuxt UI resources based on environment.
 */
function getNuxtUIBasePath(): string {
  // In Electron production, files are in extraResources
  if (process.env.PLAYSHAPE_RESOURCES_PATH) {
    return join(process.env.PLAYSHAPE_RESOURCES_PATH, 'nuxt-ui')
  }

  // In development or non-Electron production, use project resources
  // process.cwd() should be the project root
  return join(process.cwd(), 'resources', 'nuxt-ui')
}

export default defineEventHandler(async (event) => {
  const pathParam = getRouterParam(event, 'path')

  if (!pathParam) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Path parameter required',
    })
  }

  // Normalize path (handle both string and array from catch-all)
  const requestedPath = Array.isArray(pathParam) ? pathParam.join('/') : pathParam

  // Security: Prevent directory traversal
  if (requestedPath.includes('..') || requestedPath.startsWith('/')) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid path',
    })
  }

  // Extract file extension
  const extMatch = requestedPath.match(/\.[^.]+$/)
  const ext = extMatch?.[0]?.toLowerCase()

  if (!ext || !ALLOWED_EXTENSIONS.has(ext)) {
    throw createError({
      statusCode: 400,
      statusMessage: 'File type not allowed',
    })
  }

  const basePath = getNuxtUIBasePath()
  const filePath = join(basePath, requestedPath)

  // Security: Ensure resolved path is still within base directory
  if (!filePath.startsWith(basePath)) {
    throw createError({
      statusCode: 400,
      statusMessage: 'Invalid path',
    })
  }

  // Check if file exists
  try {
    await access(filePath, constants.R_OK)
  }
  catch {
    // Check if the nuxt-ui build exists at all
    try {
      await access(join(basePath, 'manifest.json'), constants.R_OK)
    }
    catch {
      // Build doesn't exist - provide helpful error
      throw createError({
        statusCode: 503,
        statusMessage: 'Nuxt UI components not built. Run: pnpm run build:nuxt-ui',
        data: {
          hint: 'The Nuxt UI components need to be pre-built before they can be used in templates.',
          command: 'pnpm run build:nuxt-ui',
        },
      })
    }

    // Build exists but specific file not found
    throw createError({
      statusCode: 404,
      statusMessage: `File not found: ${requestedPath}`,
    })
  }

  // Read and serve the file
  const content = await readFile(filePath)
  const contentType = CONTENT_TYPES[ext] || 'application/octet-stream'

  setHeader(event, 'Content-Type', contentType)

  // CORS headers: Allow the sandboxed iframe (origin: null) to load ES modules
  // The iframe uses srcdoc which has a null origin, so we need to allow all origins
  setHeader(event, 'Access-Control-Allow-Origin', '*')
  setHeader(event, 'Access-Control-Allow-Methods', 'GET')

  // Cache headers: Long-lived caching for immutable assets
  // The version.txt can be used by clients to bust cache on upgrades
  if (ext === '.js' || ext === '.css') {
    // JS/CSS are effectively immutable for a given @nuxt/ui version
    setHeader(event, 'Cache-Control', 'public, max-age=31536000, immutable')
  }
  else {
    // JSON/TXT may change on rebuild, shorter cache
    setHeader(event, 'Cache-Control', 'public, max-age=3600')
  }

  return send(event, content)
})
