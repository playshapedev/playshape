import type { UIMessage, InitialTokenUsage } from '~/types/chat'
import type { ChatMode } from '~/utils/chatMode'
import { useChat, type UseChatReturn } from './useChat'



export interface UseActivityChatReturn extends UseChatReturn {
  /** Callback when activity is updated (alias for onUpdate) */
  onActivityUpdate: UseChatReturn['onUpdate']
}

/**
 * Creates a Chat instance for an activity's AI conversation.
 *
 * Thin wrapper around useChat that configures it for populating activity data.
 * Supports preview error reporting but not file attachments.
 *
 * @param projectId - The project ID
 * @param courseId - The course ID
 * @param activityId - The activity ID to chat about
 * @param initialMessages - Initial messages to hydrate the chat
 * @param mode - Reactive ref to the current chat mode ('build' or 'plan')
 * @param initialTokenUsage - Optional initial token counts from persisted entity data
 */
export function useActivityChat(
  projectId: string,
  courseId: string,
  activityId: string,
  initialMessages: UIMessage[] = [],
  mode?: Ref<ChatMode>,
  initialTokenUsage?: InitialTokenUsage,
): UseActivityChatReturn {
  const modeRef = mode ?? ref<ChatMode>('build')

  const chatReturn = useChat(initialMessages, modeRef, initialTokenUsage, {
    apiUrl: `/api/projects/${projectId}/courses/${courseId}/activities/${activityId}/chat`,
    saveUrl: `/api/projects/${projectId}/courses/${courseId}/activities/${activityId}`,
    updateToolTypes: ['tool-update_activity'],
    supportsFiles: false,
    supportsPreviewErrors: true,
  })

  return {
    ...chatReturn,
    // Alias for backward compatibility
    onActivityUpdate: chatReturn.onUpdate,
  }
}
