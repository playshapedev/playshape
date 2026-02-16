import { Chat } from '@ai-sdk/vue'
import { DefaultChatTransport } from 'ai'
import type { UIMessage } from 'ai'

export type { UIMessage }

/**
 * Creates a Chat instance for a template's AI conversation.
 *
 * Uses @ai-sdk/vue's Chat class which handles the SSE stream parsing,
 * message state, and tool call lifecycle automatically.
 *
 * Tool call rendering (ask_question buttons, update_template indicators)
 * is handled directly in the template by iterating over message.parts —
 * no separate pendingQuestion state needed.
 */
export function useTemplateChat(templateId: string, initialMessages: UIMessage[] = []) {
  const onTemplateUpdate = ref<(() => void) | null>(null)

  // Track whether the last AI response included an update_template tool call.
  // Used to auto-report preview errors back to the AI for self-correction.
  const lastResponseHadUpdate = ref(false)

  const chat = new Chat({
    messages: initialMessages,
    transport: new DefaultChatTransport({
      api: `/api/templates/${templateId}/chat`,
    }),
    onFinish: async () => {
      // Check if any assistant message in this response used update_template
      lastResponseHadUpdate.value = chat.messages.some(msg =>
        msg.role === 'assistant'
        && msg.parts.some(p => p.type === 'tool-update_template' || p.type === 'tool-patch_component'),
      )

      await saveMessages()
      onTemplateUpdate.value?.()
    },
    onError: (error) => {
      console.error('[TemplateChat] Error:', error)
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
   * Report a preview error back to the AI so it can self-correct.
   * Only sends if the last response included an update_template call
   * and the chat is idle (not already streaming).
   */
  function reportPreviewError(error: string) {
    if (!lastResponseHadUpdate.value) return
    if (chat.status !== 'ready') return

    // Clear the flag so we don't report the same error repeatedly
    // if the AI's fix also fails, the flag will be re-set by onFinish
    lastResponseHadUpdate.value = false

    sendMessage(`[Preview Error] The template failed to render with this error:\n\n${error}\n\nPlease fix the component.`)
  }

  /**
   * Persist the current conversation to the template's messages column.
   */
  async function saveMessages() {
    try {
      await $fetch(`/api/templates/${templateId}`, {
        method: 'PATCH',
        body: { messages: chat.messages },
      })
    }
    catch {
      // Non-critical
    }
  }

  /**
   * Stop the current generation immediately.
   * Aborts the in-flight request, keeps any tokens already received,
   * and saves the conversation so the user can continue.
   */
  async function stopGeneration() {
    if (chat.status !== 'streaming' && chat.status !== 'submitted') return
    await chat.stop()
    // Persist whatever we have so far
    await saveMessages()
  }

  return {
    chat,
    sendMessage,
    stopGeneration,
    saveMessages,
    onTemplateUpdate,
    reportPreviewError,
  }
}
