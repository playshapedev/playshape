import type { UIMessage, InitialTokenUsage } from '~/types/chat'
import type { ChatMode } from '~/utils/chatMode'
import { useChat, type UseChatReturn } from './useChat'



export interface UseDocumentChatReturn extends UseChatReturn {
  /** Callback when document is updated (alias for onUpdate) */
  onDocumentUpdate: UseChatReturn['onUpdate']
}

/**
 * Creates a Chat instance for AI-generated document conversations.
 *
 * Thin wrapper around useChat that configures it for document editing.
 * Does not support file attachments.
 *
 * @param libraryId - The library ID
 * @param documentId - The document ID to chat about
 * @param initialMessages - Initial messages to hydrate the chat
 * @param mode - Reactive ref to the current chat mode ('build' or 'plan')
 * @param initialTokenUsage - Optional initial token counts from persisted entity data
 */
export function useDocumentChat(
  libraryId: string,
  documentId: string,
  initialMessages: UIMessage[] = [],
  mode?: Ref<ChatMode>,
  initialTokenUsage?: InitialTokenUsage,
): UseDocumentChatReturn {
  const modeRef = mode ?? ref<ChatMode>('build')

  const chatReturn = useChat(initialMessages, modeRef, initialTokenUsage, {
    apiUrl: `/api/libraries/${libraryId}/documents/${documentId}/chat`,
    saveUrl: `/api/libraries/${libraryId}/documents/${documentId}`,
    updateToolTypes: ['tool-update_document', 'tool-patch_document'],
    supportsFiles: false,
    supportsPreviewErrors: false,
  })

  return {
    ...chatReturn,
    // Alias for backward compatibility
    onDocumentUpdate: chatReturn.onUpdate,
  }
}
