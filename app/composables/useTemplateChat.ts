import { Chat } from '@ai-sdk/vue'
import { DefaultChatTransport } from 'ai'
import type { UIMessage, FileUIPart } from 'ai'

/** Token usage metadata sent from the server */
export interface TokenUsageMetadata {
  contextTokens?: number
  promptTokens?: number
  completionTokens?: number
  totalTokens?: number
  wasCompacted?: boolean
  compactionMessage?: string
}

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

  // Token usage - tracks cumulative totals for the conversation
  const tokenUsage = ref<TokenUsageMetadata>({})

  const chat = new Chat({
    messages: initialMessages,
    transport: new DefaultChatTransport({
      api: `/api/templates/${templateId}/chat`,
    }),
    onFinish: async ({ message }) => {
      // Check if any assistant message in this response used update_template
      lastResponseHadUpdate.value = chat.messages.some(msg =>
        msg.role === 'assistant'
        && msg.parts.some(p => p.type === 'tool-update_template' || p.type === 'tool-patch_component'),
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
      onTemplateUpdate.value?.()
    },
    onError: (error) => {
      console.error('[TemplateChat] Error:', error)
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
    tokenUsage,
  }
}
