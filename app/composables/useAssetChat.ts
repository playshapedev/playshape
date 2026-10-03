import type { UIMessage, InitialTokenUsage } from '~/types/chat'
import type { ChatMode } from '~/utils/chatMode'
import { useChat, type UseChatReturn } from './useChat'



export interface UseAssetChatReturn extends UseChatReturn {
  /** Callback when asset is updated (alias for onUpdate) */
  onAssetUpdate: UseChatReturn['onUpdate']

  /** Report an image generation error to the AI */
  reportError: (error: string) => void
}

/**
 * Creates a Chat instance for an asset's AI image generation conversation.
 *
 * Thin wrapper around useChat that configures it for asset/image editing.
 * Supports file attachments and includes image generation parameters.
 *
 * @param assetId - The asset ID to chat about
 * @param initialMessages - Initial messages to hydrate the chat
 * @param modelId - Optional reactive ref to the model ID to use for generation
 * @param aspectRatio - Optional reactive ref to the aspect ratio for generation
 * @param mode - Reactive ref to the current chat mode ('build' or 'plan')
 * @param initialTokenUsage - Optional initial token counts from persisted entity data
 */
export function useAssetChat(
  assetId: string,
  initialMessages: UIMessage[] = [],
  modelId?: Ref<string | undefined>,
  aspectRatio?: Ref<string | undefined>,
  mode?: Ref<ChatMode>,
  initialTokenUsage?: InitialTokenUsage,
): UseAssetChatReturn {
  const modeRef = mode ?? ref<ChatMode>('build')

  const chatReturn = useChat(initialMessages, modeRef, initialTokenUsage, {
    apiUrl: `/api/assets/${assetId}/chat`,
    saveUrl: `/api/assets/${assetId}`,
    bodyParams: () => ({
      modelId: modelId?.value,
      aspectRatio: aspectRatio?.value,
    }),
    updateToolTypes: ['tool-generate_image'],
    supportsFiles: true,
    supportsPreviewErrors: false,
  })

  /**
   * Report an image generation error back to the AI.
   */
  function reportError(error: string) {
    if (chatReturn.chat.status !== 'ready') return
    chatReturn.sendMessage(`[Error] Image generation failed:\n\n${error}\n\nPlease try a different approach.`)
  }

  return {
    ...chatReturn,
    // Alias for backward compatibility
    onAssetUpdate: chatReturn.onUpdate,
    reportError,
  }
}
