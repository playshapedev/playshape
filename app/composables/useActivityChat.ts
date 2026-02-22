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
 * Creates a Chat instance for an activity's AI conversation.
 *
 * Similar to useTemplateChat but for populating activity data fields.
 * The chat helps fill in template fields using library content.
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
) {
  const onActivityUpdate = ref<(() => void) | null>(null)

  // Track whether the last AI response included an update_activity tool call.
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
      api: `/api/projects/${projectId}/courses/${courseId}/activities/${activityId}/chat`,
      body: () => ({ mode: mode?.value }),
    }),
    onFinish: async ({ message }) => {
      // Check if any assistant message in this response used update_activity
      lastResponseHadUpdate.value = chat.messages.some(msg =>
        msg.role === 'assistant'
        && msg.parts.some(p => p.type === 'tool-update_activity'),
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
    tokenUsage,
  }
}
