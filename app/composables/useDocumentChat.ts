import { Chat } from '@ai-sdk/vue'
import { DefaultChatTransport } from 'ai'
import type { UIMessage } from 'ai'
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
 * Creates a Chat instance for AI-generated document conversations.
 *
 * Uses @ai-sdk/vue's Chat class which handles the SSE stream parsing,
 * message state, and tool call lifecycle automatically.
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
) {
  const onDocumentUpdate = ref<(() => void) | null>(null)

  // Track whether the last AI response included a document update
  const lastResponseHadUpdate = ref(false)

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
      api: `/api/libraries/${libraryId}/documents/${documentId}/chat`,
      body: () => ({ mode: mode?.value }),
    }),
    onFinish: async ({ message }) => {
      // Check if any assistant message in this response updated the document
      lastResponseHadUpdate.value = chat.messages.some(msg =>
        msg.role === 'assistant'
        && msg.parts.some(p =>
          p.type === 'tool-update_document' || p.type === 'tool-patch_document',
        ),
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
      onDocumentUpdate.value?.()
    },
    onError: (error) => {
      console.error('[DocumentChat] Error:', error)
    },
  })

  /**
   * Send a message from the user.
   */
  function sendMessage(content: string) {
    if (chat.status === 'streaming' || chat.status === 'submitted') return
    if (!content.trim()) return

    chat.sendMessage({ text: content })
  }

  /**
   * Persist the current conversation to the document's messages column.
   */
  async function saveMessages() {
    try {
      await $fetch(`/api/libraries/${libraryId}/documents/${documentId}`, {
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
    onDocumentUpdate,
    lastResponseHadUpdate,
    tokenUsage,
  }
}
