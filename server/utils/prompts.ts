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
