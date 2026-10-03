import type { UIMessage, InitialTokenUsage } from '~/types/chat'
import type { ChatMode } from '~/utils/chatMode'
import { useChat, type UseChatReturn } from './useChat'



export interface UseTemplateChatReturn extends UseChatReturn {
  /** Callback when template is updated (alias for onUpdate) */
  onTemplateUpdate: UseChatReturn['onUpdate']
}

/**
 * Creates a Chat instance for a template's AI conversation.
 *
 * Thin wrapper around useChat that configures it for template editing.
 * Supports file attachments and preview error reporting.
 *
 * @param templateId - The template ID to chat about
 * @param initialMessages - Initial messages to hydrate the chat
 * @param mode - Reactive ref to the current chat mode ('build' or 'plan')
 * @param initialTokenUsage - Optional initial token counts from persisted entity data
 */
export function useTemplateChat(
  templateId: string,
  initialMessages: UIMessage[] = [],
  mode?: Ref<ChatMode>,
  initialTokenUsage?: InitialTokenUsage,
): UseTemplateChatReturn {
  const modeRef = mode ?? ref<ChatMode>('build')

  const chatReturn = useChat(initialMessages, modeRef, initialTokenUsage, {
    apiUrl: `/api/templates/${templateId}/chat`,
    saveUrl: `/api/templates/${templateId}`,
    updateToolTypes: ['tool-update_template', 'tool-patch_component'],
    supportsFiles: true,
    supportsPreviewErrors: true,
  })

  return {
    ...chatReturn,
    // Alias for backward compatibility
    onTemplateUpdate: chatReturn.onUpdate,
  }
}
