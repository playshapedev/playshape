import { z } from 'zod'
import { tool } from 'ai'

/**
 * Reference file storage key map for the get_reference tool.
 * Maps topic names to their storage keys under assets:ui-references.
 */
const REFERENCE_KEY_MAP: Record<string, string> = {
  'overview': 'SKILL.md',
  'components': 'references:components.md',
  'theming': 'references:theming.md',
  'composables': 'references:composables.md',
  'layout-dashboard': 'references:layouts:dashboard.md',
  'layout-page': 'references:layouts:page.md',
  'layout-chat': 'references:layouts:chat.md',
  'layout-docs': 'references:layouts:docs.md',
  'layout-editor': 'references:layouts:editor.md',
}

/**
 * Server-executed tool that fetches UI component and design system
 * documentation from bundled Nitro server assets.
 */
export const getReferenceTool = tool({
  description: 'Fetch UI component and design system documentation. Call this before building complex interfaces (forms, dashboards, data displays, chat UIs). Returns markdown documentation for the requested topic.',
  inputSchema: z.object({
    topic: z.enum([
      'overview',
      'components',
      'theming',
      'composables',
      'layout-dashboard',
      'layout-page',
      'layout-chat',
      'layout-docs',
      'layout-editor',
    ]).describe('The documentation topic to fetch'),
  }),
  execute: async ({ topic }) => {
    try {
      const key = REFERENCE_KEY_MAP[topic]
      if (!key) return { topic, error: `Unknown reference topic: ${topic}` }
      const content = await useStorage('assets:ui-references').getItem<string>(key)
      if (!content) return { topic, error: `Reference file not found: ${key}` }
      return { topic, content }
    }
    catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to read reference file'
      return { topic, error: message }
    }
  },
})
