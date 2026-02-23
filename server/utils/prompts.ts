// ─── System prompt loader ────────────────────────────────────────────────────
// Reads prompt .md files from Nitro server assets (bundled at build time via
// unstorage). Results are cached in memory so each file is read at most once.

const PROMPT_FILES = [
  'tools',
  'field-types',
  'error-feedback',
  'preview-environment',
  'activity-tools',
  'design-system',
  'course-api',
  'template-core',
  'activity',
  'interface',
  'activity-editor',
] as const

type PromptName = typeof PROMPT_FILES[number]

let cache: Record<string, string> | null = null

async function loadPrompts(): Promise<Record<PromptName, string>> {
  if (cache) return cache as Record<PromptName, string>

  const storage = useStorage('assets:prompts')
  const entries: Record<string, string> = {}

  for (const name of PROMPT_FILES) {
    const content = await storage.getItem<string>(`${name}.md`)
    if (!content) throw new Error(`Prompt file not found in server assets: ${name}.md`)
    entries[name] = content
  }

  cache = entries
  return entries as Record<PromptName, string>
}

/**
 * Load and return the composed system prompts for activity and interface templates.
 * Files are read from Nitro server assets and cached in memory after first call.
 */
export async function useSystemPrompts() {
  const p = await loadPrompts()

  const shared = [
    p['tools'],
    p['field-types'],
    p['error-feedback'],
    p['preview-environment'],
    p['activity-tools'],
    p['design-system'],
    p['course-api'],
    p['template-core'],
  ].join('\n\n')

  return {
    activity: [p['activity'], shared].join('\n\n'),
    interface: [p['interface'], shared].join('\n\n'),
  }
}

/**
 * Load the activity editor system prompt (for populating activity data fields).
 * This is a standalone prompt — it doesn't share the template builder sections.
 */
let activityEditorCache: string | null = null

export async function useActivityEditorPrompt(): Promise<string> {
  if (activityEditorCache) return activityEditorCache

  const storage = useStorage('assets:prompts')
  const content = await storage.getItem<string>('activity-editor.md')
  if (!content) throw new Error('Prompt file not found in server assets: activity-editor.md')

  activityEditorCache = content
  return content
}

/**
 * Load the document generation system prompt (for AI-generated library documents).
 */
let documentGenerationCache: string | null = null

export async function useDocumentGenerationPrompt(): Promise<string> {
  if (documentGenerationCache) return documentGenerationCache

  const storage = useStorage('assets:prompts')
  const content = await storage.getItem<string>('document-generation.md')
  if (!content) throw new Error('Prompt file not found in server assets: document-generation.md')

  documentGenerationCache = content
  return content
}

/**
 * Load the asset generation system prompt (for AI image generation conversations).
 */
let assetGenerationCache: string | null = null

export async function useAssetGenerationPrompt(): Promise<string> {
  if (assetGenerationCache) return assetGenerationCache

  const storage = useStorage('assets:prompts')
  const content = await storage.getItem<string>('asset-generation.md')
  if (!content) throw new Error('Prompt file not found in server assets: asset-generation.md')

  assetGenerationCache = content
  return content
}

/**
 * Load the content cleanup prompts (for cleaning extracted document text).
 * Returns separate prompts for chunk cleanup and metadata generation.
 */
let contentCleanupCache: { chunkCleanup: string; metadata: string } | null = null

export async function useContentCleanupPrompts(): Promise<{ chunkCleanup: string; metadata: string }> {
  if (contentCleanupCache) return contentCleanupCache

  const storage = useStorage('assets:prompts')
  const content = await storage.getItem<string>('content-cleanup.md')
  if (!content) throw new Error('Prompt file not found in server assets: content-cleanup.md')

  // Split the prompt into its two sections
  const chunkCleanupMatch = content.match(/## Chunk Cleanup\n\n([\s\S]*?)(?=\n## Metadata Generation)/)
  const metadataMatch = content.match(/## Metadata Generation\n\n([\s\S]*)$/)

  if (!chunkCleanupMatch || !metadataMatch) {
    throw new Error('content-cleanup.md has unexpected structure')
  }

  contentCleanupCache = {
    chunkCleanup: chunkCleanupMatch[1]!.trim(),
    metadata: metadataMatch[1]!.trim(),
  }

  return contentCleanupCache
}
