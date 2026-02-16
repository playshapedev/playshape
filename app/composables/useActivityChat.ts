import { Chat } from '@ai-sdk/vue'
import { DefaultChatTransport } from 'ai'
import type { UIMessage } from 'ai'

/**
 * Creates a Chat instance for an activity's AI conversation.
 *
 * Similar to useTemplateChat but for populating activity data fields.
 * The chat helps fill in template fields using library content.
 */
export function useActivityChat(
  projectId: string,
  courseId: string,
  activityId: string,
  initialMessages: UIMessage[] = [],
) {
  const onActivityUpdate = ref<(() => void) | null>(null)

  // Track whether the last AI response included an update_activity tool call.
  const lastResponseHadUpdate = ref(false)

  const chat = new Chat({
    messages: initialMessages,
    transport: new DefaultChatTransport({
      api: `/api/projects/${projectId}/courses/${courseId}/activities/${activityId}/chat`,
    }),
    onFinish: async () => {
      // Check if any assistant message in this response used update_activity
      lastResponseHadUpdate.value = chat.messages.some(msg =>
        msg.role === 'assistant'
        && msg.parts.some(p => p.type === 'tool-update_activity'),
      )

      await saveMessages()
      onActivityUpdate.value?.()
    },
    onError: (error) => {
      console.error('[ActivityChat] Error:', error)
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
   * Only sends if the last response included an update_activity call.
   */
  function reportPreviewError(error: string) {
    if (!lastResponseHadUpdate.value) return
    if (chat.status !== 'ready') return

    lastResponseHadUpdate.value = false

    sendMessage(`[Preview Error] The activity failed to render with this error:\n\n${error}\n\nPlease check the data you provided and fix it.`)
  }

  /**
   * Persist the current conversation to the activity's messages column.
   */
  async function saveMessages() {
    try {
      await $fetch(`/api/projects/${projectId}/courses/${courseId}/activities/${activityId}`, {
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
    onActivityUpdate,
    reportPreviewError,
  }
}
