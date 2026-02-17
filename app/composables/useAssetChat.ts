import { Chat } from '@ai-sdk/vue'
import { DefaultChatTransport } from 'ai'
import type { UIMessage } from 'ai'

export type { UIMessage }

/**
 * Creates a Chat instance for an asset's AI image generation conversation.
 *
 * Uses @ai-sdk/vue's Chat class which handles the SSE stream parsing,
 * message state, and tool call lifecycle automatically.
 */
export function useAssetChat(
  assetId: string,
  initialMessages: UIMessage[] = [],
  modelId?: Ref<string | undefined>,
) {
  const onAssetUpdate = ref<(() => void) | null>(null)

  // Track whether the last AI response included a generate_image tool call
  const lastResponseHadGeneration = ref(false)

  const chat = new Chat({
    messages: initialMessages,
    transport: new DefaultChatTransport({
      api: `/api/assets/${assetId}/chat`,
      body: () => ({
        modelId: modelId?.value,
      }),
    }),
    onFinish: async () => {
      // Check if any assistant message in this response used generate_image
      lastResponseHadGeneration.value = chat.messages.some(msg =>
        msg.role === 'assistant'
        && msg.parts.some(p => p.type === 'tool-generate_image'),
      )

      await saveMessages()
      onAssetUpdate.value?.()
    },
    onError: (error) => {
      console.error('[AssetChat] Error:', error)
    },
  })

  /**
   * Send a text message from the user.
   */
  function sendMessage(content: string) {
    if (!content.trim() || chat.status === 'streaming' || chat.status === 'submitted') return
    chat.sendMessage({ text: content })
  }

  /**
   * Report a generation error back to the AI.
   */
  function reportError(error: string) {
    if (chat.status !== 'ready') return

    sendMessage(`[Error] Image generation failed:\n\n${error}\n\nPlease try a different approach.`)
  }

  /**
   * Persist the current conversation to the asset's messages column.
   */
  async function saveMessages() {
    try {
      await $fetch(`/api/assets/${assetId}`, {
        method: 'PATCH',
        body: { messages: chat.messages },
      })
    }
    catch {
      // Non-critical - messages are still in memory
    }
  }

  /**
   * Stop the current generation immediately.
   */
  async function stopGeneration() {
    if (chat.status !== 'streaming' && chat.status !== 'submitted') return
    await chat.stop()
    await saveMessages()
  }

  return {
    chat,
    sendMessage,
    stopGeneration,
    saveMessages,
    onAssetUpdate,
    reportError,
    lastResponseHadGeneration,
  }
}
