import { Chat } from '@ai-sdk/vue'
import { DefaultChatTransport } from 'ai'
import type { UIMessage, FileUIPart } from 'ai'
import type { ChatMode } from '~/utils/chatMode'

/** Token usage metadata sent from the server */
export interface TokenUsageMetadata {
  contextTokens?: number
  promptTokens?: number
  completionTokens?: number
  totalTokens?: number
  wasCompacted?: boolean
  compactionMessage?: string
}

/** Initial token usage values to hydrate from persisted entity data */
export interface InitialTokenUsage {
  totalTokens?: number
  promptTokens?: number
  completionTokens?: number
}

/**
 * Creates a Chat instance for an asset's AI image generation conversation.
 *
 * Uses @ai-sdk/vue's Chat class which handles the SSE stream parsing,
 * message state, and tool call lifecycle automatically.
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
) {
  const onAssetUpdate = ref<(() => void) | null>(null)

  // Track whether the last AI response included a generate_image tool call
  const lastResponseHadGeneration = ref(false)

  // Token usage - tracks cumulative totals for the conversation
  // Initialize with persisted values if provided
  const tokenUsage = ref<TokenUsageMetadata>({
    totalTokens: initialTokenUsage?.totalTokens ?? 0,
    promptTokens: initialTokenUsage?.promptTokens ?? 0,
    completionTokens: initialTokenUsage?.completionTokens ?? 0,
  })

  const chat = new Chat({
    messages: initialMessages,
    transport: new DefaultChatTransport({
      api: `/api/assets/${assetId}/chat`,
      body: () => ({
        modelId: modelId?.value,
        aspectRatio: aspectRatio?.value,
        mode: mode?.value,
      }),
    }),
    onFinish: async ({ message }) => {
      // Check if any assistant message in this response used generate_image
      lastResponseHadGeneration.value = chat.messages.some(msg =>
        msg.role === 'assistant'
        && msg.parts.some(p => p.type === 'tool-generate_image'),
      )

      // Extract token usage from message metadata and accumulate
      const metadata = message?.metadata as { tokenUsage?: TokenUsageMetadata } | undefined
      if (metadata?.tokenUsage) {
        const prev = tokenUsage.value
        const incoming = metadata.tokenUsage

        tokenUsage.value = {
          // Accumulate tokens across responses
          promptTokens: (prev.promptTokens ?? 0) + (incoming.promptTokens ?? 0),
          completionTokens: (prev.completionTokens ?? 0) + (incoming.completionTokens ?? 0),
          totalTokens: (prev.totalTokens ?? 0) + (incoming.totalTokens ?? 0),
          // Context tokens are from the latest request only
          contextTokens: incoming.contextTokens,
          // Track if any response used compaction
          wasCompacted: prev.wasCompacted || incoming.wasCompacted,
          compactionMessage: incoming.compactionMessage || prev.compactionMessage,
        }
      }

      await saveMessages()
      onAssetUpdate.value?.()
    },
    onError: (error) => {
      console.error('[AssetChat] Error:', error)
    },
  })

  /**
   * Send a message from the user, optionally with file attachments.
   */
  function sendMessage(content: string, files?: FileUIPart[]) {
    if (chat.status === 'streaming' || chat.status === 'submitted') return
    if (!content.trim() && (!files || files.length === 0)) return

    if (files && files.length > 0) {
      chat.sendMessage({ text: content, files })
    }
    else {
      chat.sendMessage({ text: content })
    }
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
    tokenUsage,
  }
}
