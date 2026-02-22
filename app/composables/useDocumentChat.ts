import { Chat } from '@ai-sdk/vue'
import { DefaultChatTransport } from 'ai'
import type { UIMessage } from 'ai'

/**
 * Creates a Chat instance for AI-generated document conversations.
 *
 * Uses @ai-sdk/vue's Chat class which handles the SSE stream parsing,
 * message state, and tool call lifecycle automatically.
 */
export function useDocumentChat(
  libraryId: string,
  documentId: string,
  initialMessages: UIMessage[] = [],
) {
  const onDocumentUpdate = ref<(() => void) | null>(null)

  // Track whether the last AI response included a document update
  const lastResponseHadUpdate = ref(false)

  const chat = new Chat({
    messages: initialMessages,
    transport: new DefaultChatTransport({
      api: `/api/libraries/${libraryId}/documents/${documentId}/chat`,
    }),
    onFinish: async () => {
      // Check if any assistant message in this response updated the document
      lastResponseHadUpdate.value = chat.messages.some(msg =>
        msg.role === 'assistant'
        && msg.parts.some(p =>
          p.type === 'tool-update_document' || p.type === 'tool-patch_document',
        ),
      )

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
  }
}
