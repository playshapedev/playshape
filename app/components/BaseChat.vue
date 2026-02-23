<script setup lang="ts">
import type { Chat } from '@ai-sdk/vue'
import type { UIMessage, FileUIPart, TokenUsageMetadata, ToolIndicator, PendingQuestions, QueuedMessage, SendMessageResult } from '~/types/chat'
import type { AskQuestionInput } from '~~/server/utils/tools/askQuestion'
import type { ChatMode } from '~/utils/chatMode'

// ─── Props ───────────────────────────────────────────────────────────────────

const props = withDefaults(defineProps<{
  /** The Chat instance from useChat or entity composable */
  chat: Chat<UIMessage>
  /** Function to send a message. Returns status: 'sent', 'queued', or 'queue-full' */
  sendMessage: (content: string, files?: FileUIPart[]) => SendMessageResult
  /** Function to stop generation */
  stopGeneration: () => Promise<void>
  /** Reactive token usage */
  tokenUsage: TokenUsageMetadata
  /** Current chat mode */
  mode: ChatMode
  /** Messages queued to be sent after current response */
  messageQueue?: QueuedMessage[]
  /** Function to clear queued messages */
  clearQueue?: () => void
  /** Whether attachments are enabled */
  enableAttachments?: boolean
  /** Whether mode toggle is enabled */
  enableModeToggle?: boolean
  /** Placeholder text for input */
  placeholder?: string
  /** Icon for empty state */
  emptyIcon?: string
  /** Message for empty state */
  emptyMessage?: string
  /** Tool indicator configuration */
  toolIndicators?: Record<string, ToolIndicator>
  /** Function to filter messages for display (e.g., hide preview errors) */
  filterMessages?: (messages: UIMessage[]) => UIMessage[]
  /** Hint text below input */
  inputHint?: string
  /** Optional entity ID for attachment uploads */
  attachmentEntityId?: string
  /** Entity type for attachment uploads: 'template' | 'asset' */
  attachmentEntityType?: 'template' | 'asset'
}>(), {
  messageQueue: () => [],
  clearQueue: undefined,
  enableAttachments: false,
  enableModeToggle: true,
  placeholder: 'Type a message...',
  emptyIcon: 'i-lucide-message-square',
  emptyMessage: 'Start the conversation.',
  toolIndicators: () => ({}),
  filterMessages: undefined,
  inputHint: undefined,
  attachmentEntityId: undefined,
  attachmentEntityType: undefined,
})

const emit = defineEmits<{
  /** Emitted when mode toggle is clicked */
  toggleMode: []
  /** Emitted when an update tool completes (for parent to refresh data) */
  update: []
}>()

// ─── Attachments ─────────────────────────────────────────────────────────────

const {
  pendingAttachments,
  isUploading,
  uploadError,
  hasPending,
  addFiles,
  handlePaste,
  removeAttachment,
  uploadAttachments,
} = useChatAttachments()

const fileInputRef = ref<HTMLInputElement | null>(null)

function openFilePicker() {
  fileInputRef.value?.click()
}

function onFileSelect(event: Event) {
  const input = event.target as HTMLInputElement
  if (input.files) {
    addFiles(input.files)
    input.value = '' // Reset so the same file can be selected again
  }
}

function onPaste(event: ClipboardEvent) {
  if (props.enableAttachments) {
    handlePaste(event)
  }
}

// ─── Messages ────────────────────────────────────────────────────────────────

const visibleMessages = computed(() => {
  if (props.filterMessages) {
    return props.filterMessages(props.chat.messages)
  }
  return props.chat.messages
})

const isRunning = computed(() =>
  props.chat.status === 'streaming' || props.chat.status === 'submitted',
)

// Check if we should show "Thinking..." indicator
// Show when: submitted, OR streaming but last assistant message has no text content yet
const showThinking = computed(() => {
  if (props.chat.status === 'submitted') return true
  if (props.chat.status !== 'streaming') return false

  // During streaming, check if the last assistant message has any text content
  const msgs = props.chat.messages
  if (!msgs.length) return true

  const lastMsg = msgs[msgs.length - 1]
  if (!lastMsg || lastMsg.role !== 'assistant') return true

  // Check if any part has visible text
  const hasText = lastMsg.parts.some(
    (part: { type: string; text?: string }) =>
      part.type === 'text' && part.text && part.text.trim().length > 0,
  )
  return !hasText
})

// ─── Multi-Question State ────────────────────────────────────────────────────

const activeQuestionIndex = ref(0)
const selectedOptionIndex = ref(0)
const answers = ref<Map<string, string>>(new Map())
const customInputForQuestion = ref<string | null>(null)
const customAnswerText = ref('')
const customInputRef = ref<{ el: HTMLInputElement } | null>(null)

/**
 * Find the pending ask_question tool call from the last assistant message.
 */
const pendingQuestions = computed<PendingQuestions | null>(() => {
  const msgs = props.chat.messages
  if (!msgs.length) return null
  const last = msgs[msgs.length - 1]
  if (!last || last.role !== 'assistant') return null

  for (const part of last.parts) {
    if (part.type === 'tool-ask_question') {
      const p = part as { state: string; toolCallId: string; input: AskQuestionInput }
      if (p.state === 'input-available') {
        return {
          toolCallId: p.toolCallId,
          questions: p.input.questions,
        }
      }
    }
  }
  return null
})

// Derived state
const activeQuestion = computed(() => pendingQuestions.value?.questions[activeQuestionIndex.value])
const isSingleQuestion = computed(() => pendingQuestions.value?.questions.length === 1)
const allAnswered = computed(() => {
  if (!pendingQuestions.value) return false
  return pendingQuestions.value.questions.every(q => answers.value.has(q.id))
})
const showConfirmTab = computed(() => !isSingleQuestion.value && allAnswered.value)
const isOnConfirmTab = computed(() =>
  pendingQuestions.value && activeQuestionIndex.value === pendingQuestions.value.questions.length,
)

// Reset state when questions change (new tool call)
watch(pendingQuestions, (newVal, oldVal) => {
  if (newVal?.toolCallId !== oldVal?.toolCallId) {
    answers.value = new Map()
    activeQuestionIndex.value = 0
    selectedOptionIndex.value = 0
    customInputForQuestion.value = null
    customAnswerText.value = ''
  }
})

// ─── Question Navigation & Selection ─────────────────────────────────────────

function goToQuestion(index: number) {
  activeQuestionIndex.value = index
  selectedOptionIndex.value = 0
  customInputForQuestion.value = null
}

function goToConfirm() {
  if (!pendingQuestions.value) return
  activeQuestionIndex.value = pendingQuestions.value.questions.length
}

function selectOption(value: string) {
  if (!activeQuestion.value) return
  answers.value.set(activeQuestion.value.id, value)
  advanceToNext()
}

function advanceToNext() {
  if (!pendingQuestions.value) return

  // Single question? Submit immediately
  if (isSingleQuestion.value) {
    submitAllAnswers()
    return
  }

  // Find next unanswered question
  const questions = pendingQuestions.value.questions
  for (let i = 0; i < questions.length; i++) {
    const idx = (activeQuestionIndex.value + 1 + i) % questions.length
    if (!answers.value.has(questions[idx]!.id)) {
      goToQuestion(idx)
      return
    }
  }

  // All answered - go to confirm tab
  goToConfirm()
}

function submitAllAnswers() {
  if (!pendingQuestions.value) return

  const answersObj: Record<string, string> = {}
  for (const [id, value] of answers.value) {
    answersObj[id] = value
  }

  props.sendMessage(JSON.stringify({ answers: answersObj }))

  // Reset state
  answers.value = new Map()
  activeQuestionIndex.value = 0
  selectedOptionIndex.value = 0
}

function openQuestionCustomInput() {
  if (!activeQuestion.value) return
  customInputForQuestion.value = activeQuestion.value.id
  customAnswerText.value = ''
  nextTick(() => {
    customInputRef.value?.el?.focus()
  })
}

function submitQuestionCustomAnswer() {
  if (!customAnswerText.value.trim() || !activeQuestion.value) return
  const text = customAnswerText.value.trim()
  customInputForQuestion.value = null
  customAnswerText.value = ''
  selectOption(text)
}

function cancelQuestionCustomInput() {
  customInputForQuestion.value = null
  customAnswerText.value = ''
}

function cancelQuestions() {
  props.stopGeneration()
  answers.value = new Map()
  activeQuestionIndex.value = 0
  selectedOptionIndex.value = 0
  customInputForQuestion.value = null
  customAnswerText.value = ''
  nextTick(() => {
    textareaRef.value?.textareaRef?.focus()
  })
}

// ─── Text Input ──────────────────────────────────────────────────────────────

const input = ref('')
const textareaRef = ref<{ textareaRef: HTMLTextAreaElement } | null>(null)
const toast = useToast()

async function handleSend() {
  if (!input.value.trim() && !hasPending.value) return

  const text = input.value.trim()

  // Upload attachments if any
  let files: FileUIPart[] | undefined
  if (hasPending.value && props.attachmentEntityId) {
    try {
      const messageId = crypto.randomUUID()
      const uploadParams: { messageId: string; assetId?: string; templateId?: string } = { messageId }

      if (props.attachmentEntityType === 'template') {
        uploadParams.templateId = props.attachmentEntityId
      }
      else if (props.attachmentEntityType === 'asset') {
        uploadParams.assetId = props.attachmentEntityId
      }

      files = await uploadAttachments(uploadParams)
    }
    catch {
      // Error is already set in uploadError, don't send the message
      return
    }
  }

  const result = props.sendMessage(text, files)

  if (result === 'queue-full') {
    toast.add({
      title: 'Queue full',
      description: 'Please wait for the current response to complete.',
      color: 'warning',
      icon: 'i-lucide-clock',
    })
    // Don't clear input when queue is full
    return
  }

  // Clear input on successful send or queue
  input.value = ''
}

// ─── Error Handling ──────────────────────────────────────────────────────────

function formatError(error: Error): string {
  const msg = error.message || 'An unknown error occurred'

  if (msg.includes('409')) return 'No active AI provider configured. Go to Settings to add and activate a provider.'
  if (msg.includes('429') || msg.toLowerCase().includes('rate limit')) return 'Rate limit exceeded. Please wait a moment and try again.'
  if (msg.includes('401') || msg.includes('403') || msg.toLowerCase().includes('unauthorized') || msg.toLowerCase().includes('api key')) return 'Authentication failed. Check your API key in Settings.'
  if (msg.includes('404') && msg.toLowerCase().includes('model')) return 'Model not found. Check your provider configuration in Settings.'
  if (msg.toLowerCase().includes('connection') || msg.toLowerCase().includes('econnrefused') || msg.toLowerCase().includes('fetch failed')) return 'Could not connect to the AI provider. Make sure it is running and accessible.'
  if (msg.toLowerCase().includes('timeout')) return 'Request timed out. The model may be overloaded — try again.'

  return msg
}

function handleRetry() {
  props.chat.clearError()
  const msgs = props.chat.messages
  for (let i = msgs.length - 1; i >= 0; i--) {
    if (msgs[i]!.role === 'user') {
      const textPart = msgs[i]!.parts.find((p: { type: string }) => p.type === 'text') as { type: 'text'; text: string } | undefined
      if (textPart?.text) {
        // The Chat instance is designed to be mutated - parent provides it and expects us to modify it
        // eslint-disable-next-line vue/no-mutating-props
        props.chat.messages.splice(i)
        props.sendMessage(textPart.text)
        return
      }
    }
  }
}

// ─── Keyboard Handling ───────────────────────────────────────────────────────

function onKeyDown(e: KeyboardEvent) {
  // Escape: clear queue, stop generation, or cancel questions
  if (e.key === 'Escape') {
    // First priority: clear any queued messages
    if (props.messageQueue && props.messageQueue.length > 0 && props.clearQueue) {
      e.preventDefault()
      props.clearQueue()
      return
    }
    if (customInputForQuestion.value) {
      e.preventDefault()
      cancelQuestionCustomInput()
      return
    }
    if (pendingQuestions.value) {
      e.preventDefault()
      cancelQuestions()
      return
    }
    if (isRunning.value) {
      e.preventDefault()
      props.stopGeneration()
      return
    }
  }

  // Rest of keyboard handling only applies when questions are pending
  if (!pendingQuestions.value || props.chat.status === 'streaming' || customInputForQuestion.value) return

  const questions = pendingQuestions.value.questions

  // Tab / Shift+Tab: switch between question tabs (only if multiple questions)
  // Tab at the end wraps back to the first question
  if (e.key === 'Tab' && !isSingleQuestion.value) {
    e.preventDefault()
    const maxIndex = showConfirmTab.value ? questions.length : questions.length - 1
    const totalTabs = maxIndex + 1
    if (e.shiftKey) {
      activeQuestionIndex.value = (activeQuestionIndex.value - 1 + totalTabs) % totalTabs
    }
    else {
      activeQuestionIndex.value = (activeQuestionIndex.value + 1) % totalTabs
    }
    selectedOptionIndex.value = 0
    return
  }

  // On confirm tab
  if (isOnConfirmTab.value) {
    if (e.key === 'Enter') {
      e.preventDefault()
      submitAllAnswers()
    }
    return
  }

  // Arrow keys: navigate options within current question
  if (activeQuestion.value) {
    const totalOptions = activeQuestion.value.options.length + 1 // +1 for custom input

    if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
      e.preventDefault()
      selectedOptionIndex.value = (selectedOptionIndex.value + 1) % totalOptions
      return
    }
    if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
      e.preventDefault()
      selectedOptionIndex.value = (selectedOptionIndex.value - 1 + totalOptions) % totalOptions
      return
    }

    // Enter: select highlighted option
    if (e.key === 'Enter') {
      e.preventDefault()
      if (selectedOptionIndex.value < activeQuestion.value.options.length) {
        selectOption(activeQuestion.value.options[selectedOptionIndex.value]!.value)
      }
      else {
        openQuestionCustomInput()
      }
      return
    }

    // Number keys (1-9) for direct selection
    const num = parseInt(e.key)
    if (num >= 1 && num <= totalOptions) {
      e.preventDefault()
      if (num <= activeQuestion.value.options.length) {
        selectOption(activeQuestion.value.options[num - 1]!.value)
      }
      else {
        openQuestionCustomInput()
      }
    }
  }
}

// ─── Bottom-anchored Scroll Layout ───────────────────────────────────────────

const messagesContainer = ref<HTMLElement | null>(null)
const innerWrapperRef = ref<HTMLElement | null>(null)
const SPACER_PADDING = 40
const containerHeight = ref(0)
const spacerHeight = ref(0)
let containerObserver: ResizeObserver | null = null
let contentObserver: ResizeObserver | null = null
let lastContentHeight = 0

function updateSpacerHeight() {
  if (!messagesContainer.value || !innerWrapperRef.value) {
    spacerHeight.value = 0
    return
  }

  const msgs = visibleMessages.value
  let lastUserMsg: typeof msgs[0] | undefined
  for (let i = msgs.length - 1; i >= 0; i--) {
    if (msgs[i]!.role === 'user') {
      lastUserMsg = msgs[i]
      break
    }
  }

  if (!lastUserMsg) {
    spacerHeight.value = 0
    return
  }

  const el = messagesContainer.value.querySelector(`[data-message-id="${lastUserMsg.id}"]`) as HTMLElement | null
  if (!el) {
    spacerHeight.value = 0
    return
  }

  const msgTop = el.offsetTop
  const viewportHeight = containerHeight.value
  const contentWithoutSpacer = innerWrapperRef.value.scrollHeight - spacerHeight.value
  const needed = Math.max(0, msgTop + viewportHeight - contentWithoutSpacer - SPACER_PADDING)

  spacerHeight.value = needed
}

// ─── Lifecycle ───────────────────────────────────────────────────────────────

onMounted(() => {
  window.addEventListener('keydown', onKeyDown)
  if (props.enableAttachments) {
    window.addEventListener('paste', onPaste)
  }

  if (messagesContainer.value) {
    containerObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        containerHeight.value = entry.contentRect.height
      }
      updateSpacerHeight()
    })
    containerObserver.observe(messagesContainer.value)
  }

  if (innerWrapperRef.value) {
    contentObserver = new ResizeObserver(() => {
      if (!innerWrapperRef.value) return
      const contentHeight = innerWrapperRef.value.scrollHeight - spacerHeight.value
      if (Math.abs(contentHeight - lastContentHeight) < 1) return
      lastContentHeight = contentHeight
      updateSpacerHeight()
    })
    contentObserver.observe(innerWrapperRef.value)
  }

  // Restored conversations: scroll to bottom
  if (visibleMessages.value.length && messagesContainer.value) {
    const container = messagesContainer.value
    let debounceTimer: ReturnType<typeof setTimeout>

    const scrollToBottom = () => {
      updateSpacerHeight()
      nextTick(() => {
        container.scrollTop = container.scrollHeight
      })
    }

    const observer = new MutationObserver(() => {
      clearTimeout(debounceTimer)
      debounceTimer = setTimeout(() => {
        observer.disconnect()
        scrollToBottom()
      }, 150)
    })

    observer.observe(container, { childList: true, subtree: true, characterData: true })

    debounceTimer = setTimeout(() => {
      observer.disconnect()
      scrollToBottom()
    }, 150)
  }
})

onUnmounted(() => {
  window.removeEventListener('keydown', onKeyDown)
  if (props.enableAttachments) {
    window.removeEventListener('paste', onPaste)
  }
  containerObserver?.disconnect()
  contentObserver?.disconnect()
})

// Scroll user's latest message to top when sent
let lastVisibleCount = visibleMessages.value.length

watch(() => visibleMessages.value.length, (count) => {
  if (count > lastVisibleCount) {
    const lastMsg = visibleMessages.value[count - 1]
    if (lastMsg?.role === 'user') {
      nextTick(() => {
        updateSpacerHeight()
        if (!messagesContainer.value) return
        nextTick(() => {
          const el = messagesContainer.value!.querySelector(`[data-message-id="${lastMsg.id}"]`) as HTMLElement | null
          if (el) {
            el.scrollIntoView({ behavior: 'smooth', block: 'start' })
          }
        })
      })
    }
  }
  lastVisibleCount = count
})

// ─── Tool Indicator Helpers ──────────────────────────────────────────────────

// ─── Message Formatting ──────────────────────────────────────────────────────

/**
 * Check if a user message text is a JSON answer response from the question UI.
 * Returns the parsed answers object if so, null otherwise.
 */
function parseAnswerResponse(text: string): Record<string, string> | null {
  if (!text.startsWith('{')) return null
  try {
    const parsed = JSON.parse(text)
    if (parsed && typeof parsed === 'object' && parsed.answers && typeof parsed.answers === 'object') {
      return parsed.answers as Record<string, string>
    }
  }
  catch {
    // Not JSON
  }
  return null
}

/**
 * Format answer responses for display.
 * Converts {"answers": {"tone": "formal", "length": "short"}} to a readable list.
 */
function formatAnswerResponse(answers: Record<string, string>): string {
  return Object.entries(answers)
    .map(([key, value]) => `${key}: ${value}`)
    .join('\n')
}

function getToolLoadingLabel(toolType: string, input: Record<string, unknown>): string {
  const indicator = props.toolIndicators[toolType]
  if (!indicator) return 'Processing...'
  if (typeof indicator.loadingLabel === 'function') {
    return indicator.loadingLabel(input)
  }
  return indicator.loadingLabel
}

function getToolDoneLabel(toolType: string, input: Record<string, unknown>, output: Record<string, unknown>): string | undefined {
  const indicator = props.toolIndicators[toolType]
  if (!indicator?.doneLabel) return undefined
  if (typeof indicator.doneLabel === 'function') {
    return indicator.doneLabel(input, output)
  }
  return indicator.doneLabel
}

function shouldShowToolDone(toolType: string, input: Record<string, unknown>, output: Record<string, unknown>): boolean {
  const label = getToolDoneLabel(toolType, input, output)
  return !!label
}
</script>

<template>
  <div class="flex flex-col h-full overflow-hidden">
    <!-- Header slot + token usage -->
    <div v-if="$slots.header || tokenUsage.totalTokens || tokenUsage.contextTokens" class="flex items-center justify-between px-3 py-1.5 border-b border-default">
      <slot name="header">
        <!-- Empty div to push token usage to the right when no header content -->
        <div />
      </slot>
      <ChatTokenUsage
        v-if="tokenUsage.totalTokens || tokenUsage.contextTokens"
        :total-tokens="tokenUsage.totalTokens"
        :context-tokens="tokenUsage.contextTokens"
        :was-compacted="tokenUsage.wasCompacted"
      />
    </div>

    <!-- Messages (scroll container) -->
    <div ref="messagesContainer" class="flex-1 overflow-y-auto overflow-x-hidden">
      <div ref="innerWrapperRef" class="relative min-h-full flex flex-col justify-end p-3 space-y-3">
        <!-- Empty state -->
        <div v-if="!visibleMessages.length && chat.status === 'ready'" class="flex-1 flex flex-col items-center justify-center text-center font-mono">
          <UIcon :name="emptyIcon" class="size-8 text-muted mb-2" />
          <p class="text-sm text-muted">
            {{ emptyMessage }}
          </p>
        </div>

        <!-- Message list -->
        <div v-for="msg in visibleMessages" :key="msg.id" :data-message-id="msg.id">
          <div
            class="font-mono text-sm min-w-0 break-words overflow-hidden py-1.5"
            :class="msg.role === 'user'
              ? 'pl-3 border-l-2 border-primary bg-primary/5'
              : ''"
          >
            <template v-for="(part, i) in msg.parts" :key="`${msg.id}-${part.type}-${i}`">
              <!-- Text -->
              <MDC v-if="part.type === 'text' && msg.role === 'assistant'" :value="(part as any).text.trim()" :cache-key="`${msg.id}-${i}`" class="chat-prose *:first:mt-0 *:last:mb-0" />
              <!-- User text: format answer responses nicely -->
              <p v-else-if="part.type === 'text' && parseAnswerResponse((part as any).text)" class="whitespace-pre-wrap text-muted italic">{{ formatAnswerResponse(parseAnswerResponse((part as any).text)!) }}</p>
              <p v-else-if="part.type === 'text'" class="whitespace-pre-wrap">{{ (part as any).text }}</p>

              <!-- Attached image -->
              <img
                v-else-if="part.type === 'file' && (part as FileUIPart).mediaType?.startsWith('image/')"
                :src="(part as FileUIPart).url"
                :alt="(part as FileUIPart).filename || 'Attached image'"
                class="max-w-full max-h-64 rounded-lg mt-2 object-contain"
              >

              <!-- Tool indicators (driven by toolIndicators prop) -->
              <template v-else-if="part.type.startsWith('tool-') && part.type !== 'tool-ask_question' && toolIndicators[part.type]">
                <!-- Tool in progress -->
                <div
                  v-if="(part as any).state !== 'output-available'"
                  class="flex items-center gap-1.5 text-xs text-muted not-first:mt-1"
                >
                  <UIcon name="i-lucide-loader-2" class="size-3.5 animate-spin" />
                  {{ getToolLoadingLabel(part.type, (part as any).input ?? {}) }}
                </div>

                <!-- Tool complete with failure -->
                <div
                  v-else-if="toolIndicators[part.type]!.showFailure && (part as any).output?.success === false"
                  class="flex items-center gap-1.5 text-xs text-muted not-first:mt-1"
                >
                  <UIcon name="i-lucide-alert-circle" class="size-3.5 text-warning" />
                  {{ toolIndicators[part.type]!.failLabel || 'Failed — retrying...' }}
                </div>

                <!-- Tool complete (success) -->
                <div
                  v-else-if="shouldShowToolDone(part.type, (part as any).input ?? {}, (part as any).output ?? {})"
                  class="flex items-center gap-1.5 text-xs text-dimmed not-first:mt-1"
                >
                  <UIcon
                    :name="toolIndicators[part.type]!.doneIcon || 'i-lucide-check-circle'"
                    class="size-3.5 text-success"
                  />
                  {{ getToolDoneLabel(part.type, (part as any).input ?? {}, (part as any).output ?? {}) }}
                </div>
              </template>

              <!-- Ask question indicator (in message history) -->
              <div
                v-else-if="part.type === 'tool-ask_question'"
                class="flex items-center gap-1.5 text-xs text-muted not-first:mt-1"
              >
                <UIcon name="i-lucide-message-circle-question" class="size-3.5" />
                {{ (part as any).input?.questions?.[0]?.question || 'Asked a question' }}
              </div>

              <!-- Custom tool slot -->
              <slot v-else-if="part.type.startsWith('tool-')" :name="`tool-${part.type.slice(5)}`" :part="part" />
            </template>
          </div>
        </div>

        <!-- Compaction message -->
        <div
          v-if="tokenUsage.wasCompacted && tokenUsage.compactionMessage"
          class="text-xs text-muted italic py-2 px-3 bg-muted/30 rounded flex items-center gap-2"
        >
          <UIcon name="i-lucide-archive" class="size-3.5 shrink-0" />
          <span>{{ tokenUsage.compactionMessage }}</span>
        </div>

        <!-- Loading indicator (show when waiting or streaming without visible text yet) -->
        <div v-if="showThinking" class="flex items-center gap-2 font-mono text-sm text-muted">
          <UIcon name="i-lucide-loader-2" class="size-4 animate-spin" />
          <span>Thinking...</span>
        </div>

        <!-- Error -->
        <div v-if="chat.error" class="text-sm bg-error/10 rounded-lg p-3 space-y-2">
          <div class="flex items-start gap-2">
            <UIcon name="i-lucide-alert-circle" class="size-4 text-error shrink-0 mt-0.5" />
            <span class="text-error">{{ formatError(chat.error) }}</span>
          </div>
          <div class="flex items-center gap-2">
            <UButton
              size="xs"
              variant="soft"
              color="error"
              icon="i-lucide-refresh-cw"
              label="Retry"
              @click="handleRetry"
            />
            <UButton
              size="xs"
              variant="ghost"
              color="error"
              icon="i-lucide-x"
              label="Dismiss"
              @click="chat.clearError()"
            />
          </div>
        </div>

        <!-- Queued messages -->
        <div v-for="queued in messageQueue" :key="queued.id" :data-queued-id="queued.id">
          <div class="pl-3 border-l-2 border-dashed border-primary/50 bg-primary/5 py-1.5 font-mono text-sm">
            <span class="text-xs text-muted italic">Queued</span>
            <p class="whitespace-pre-wrap opacity-75 mt-1">{{ queued.content }}</p>
            <!-- Attachment indicator -->
            <div v-if="queued.files?.length" class="flex items-center gap-1 text-xs text-muted mt-1">
              <UIcon name="i-lucide-paperclip" class="size-3" />
              <span>{{ queued.files.length }} attachment{{ queued.files.length > 1 ? 's' : '' }}</span>
            </div>
          </div>
        </div>

        <!-- Bottom spacer -->
        <div v-if="visibleMessages.length && spacerHeight > 0" :style="{ minHeight: spacerHeight + 'px' }" aria-hidden="true" />
      </div>
    </div>

    <!-- Question UI (replaces input when AI asks questions) -->
    <div v-if="pendingQuestions" class="border-t border-default font-mono">
      <!-- Tab bar (only show if multiple questions) -->
      <div v-if="!isSingleQuestion" class="flex border-b border-default px-3">
        <button
          v-for="(q, index) in pendingQuestions.questions"
          :key="q.id"
          type="button"
          :class="[
            'px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors flex items-center gap-1.5',
            activeQuestionIndex === index
              ? 'border-primary text-primary'
              : 'border-transparent text-muted hover:text-default'
          ]"
          @click="goToQuestion(index)"
        >
          {{ q.label }}
          <UIcon v-if="answers.has(q.id)" name="i-lucide-check" class="size-3 text-success" />
        </button>
        <!-- Confirm tab -->
        <button
          v-if="showConfirmTab"
          type="button"
          :class="[
            'px-3 py-2 text-sm font-medium border-b-2 -mb-px transition-colors',
            isOnConfirmTab
              ? 'border-primary text-primary'
              : 'border-transparent text-muted hover:text-default'
          ]"
          @click="goToConfirm"
        >
          Confirm
        </button>
      </div>

      <!-- Question content -->
      <div class="p-3 space-y-3">
        <template v-if="!isOnConfirmTab && activeQuestion">
          <p class="text-sm">{{ activeQuestion.question }}</p>

          <!-- Options list -->
          <div v-if="customInputForQuestion !== activeQuestion.id" class="space-y-1">
            <button
              v-for="(option, index) in activeQuestion.options"
              :key="option.value"
              type="button"
              :class="[
                'w-full text-left px-2 py-1.5 rounded cursor-pointer',
                answers.get(activeQuestion.id) === option.value
                  ? 'bg-primary/10 text-primary'
                  : selectedOptionIndex === index
                    ? 'bg-accented/75'
                    : ''
              ]"
              @click="selectOption(option.value)"
            >
              <div class="flex items-start gap-2">
                <span class="text-muted w-4 shrink-0">{{ index + 1 }}.</span>
                <div class="min-w-0">
                  <span class="font-medium">{{ option.label }}</span>
                  <p v-if="option.description" class="text-xs text-muted mt-0.5">
                    {{ option.description }}
                  </p>
                </div>
              </div>
            </button>
            <!-- Custom answer option -->
            <button
              type="button"
              :class="[
                'w-full text-left px-2 py-1.5 rounded cursor-pointer',
                selectedOptionIndex === activeQuestion.options.length
                  ? 'bg-accented/75'
                  : ''
              ]"
              @click="openQuestionCustomInput"
            >
              <div class="flex items-start gap-2">
                <span class="text-muted w-4 shrink-0">{{ activeQuestion.options.length + 1 }}.</span>
                <span class="text-primary">Type your own answer</span>
              </div>
            </button>
          </div>

          <!-- Custom input -->
          <div v-else class="flex gap-2">
            <UInput
              ref="customInputRef"
              v-model="customAnswerText"
              placeholder="Type your answer..."
              class="flex-1"
              autofocus
              @keydown.enter.prevent.stop="submitQuestionCustomAnswer"
              @keydown.escape.prevent.stop="cancelQuestionCustomInput"
            />
            <UButton
              icon="i-lucide-send"
              :disabled="!customAnswerText.trim()"
              @click="submitQuestionCustomAnswer"
            />
            <UButton
              icon="i-lucide-x"
              variant="ghost"
              color="neutral"
              @click="cancelQuestionCustomInput"
            />
          </div>
        </template>

        <!-- Confirm tab content -->
        <template v-else-if="isOnConfirmTab">
          <p class="text-sm text-muted">Review your answers:</p>
          <div class="space-y-1 text-sm">
            <div v-for="q in pendingQuestions.questions" :key="q.id" class="flex gap-2">
              <span class="text-muted">{{ q.label }}:</span>
              <span>{{ answers.get(q.id) || '(not answered)' }}</span>
            </div>
          </div>
          <UButton class="mt-2" @click="submitAllAnswers">
            Confirm
          </UButton>
        </template>
      </div>

      <!-- Keyboard hints -->
      <div class="px-3 pb-2 flex gap-4 text-xs text-muted">
        <span v-if="!isSingleQuestion"><UKbd value="Tab" size="xs" /> switch</span>
        <span><UKbd value="↑↓" size="xs" /> select</span>
        <span><UKbd value="Enter" size="xs" /> confirm</span>
        <span><UKbd value="Esc" size="xs" /> cancel</span>
      </div>
    </div>

    <!-- Text input (hidden when questions are pending) -->
    <div v-else class="border-t border-default p-4 space-y-3">
      <!-- Pending attachments preview -->
      <div v-if="enableAttachments && pendingAttachments.length" class="flex flex-wrap gap-2">
        <div
          v-for="attachment in pendingAttachments"
          :key="attachment.id"
          class="relative group"
        >
          <img
            :src="attachment.previewUrl"
            :alt="attachment.file.name"
            class="h-16 w-16 object-cover rounded-lg border border-default"
          >
          <button
            type="button"
            class="absolute -top-1.5 -right-1.5 size-5 rounded-full bg-error text-white flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
            @click="removeAttachment(attachment.id)"
          >
            <UIcon name="i-lucide-x" class="size-3" />
          </button>
        </div>
        <div v-if="isUploading" class="h-16 w-16 rounded-lg border border-default flex items-center justify-center bg-elevated">
          <UIcon name="i-lucide-loader-2" class="size-5 animate-spin text-muted" />
        </div>
      </div>

      <!-- Upload error -->
      <div v-if="enableAttachments && uploadError" class="text-xs text-error flex items-center gap-1">
        <UIcon name="i-lucide-alert-circle" class="size-3.5" />
        {{ uploadError }}
      </div>

      <!-- Input row -->
      <div
        class="flex items-end gap-2 pl-3 border-l-2 rounded-r-lg transition-colors"
        :class="mode === 'plan'
          ? 'border-warning bg-warning/5'
          : 'border-primary bg-primary/5'"
      >
        <!-- Hidden file input -->
        <input
          v-if="enableAttachments"
          ref="fileInputRef"
          type="file"
          accept="image/*"
          multiple
          class="hidden"
          @change="onFileSelect"
        >

        <!-- Attachment button -->
        <UButton
          v-if="enableAttachments"
          icon="i-lucide-paperclip"
          variant="ghost"
          color="neutral"
          size="sm"
          :disabled="isUploading"
          class="mb-1"
          @click="openFilePicker"
        />

        <UTextarea
          ref="textareaRef"
          v-model="input"
          :placeholder="placeholder"
          class="flex-1 font-mono text-sm"
          variant="none"
          autoresize
          autofocus
          :rows="1"
          :maxrows="6"
          :disabled="isUploading"
          @keydown.enter.exact.prevent="handleSend"
          @keydown.escape="stopGeneration()"
          @keydown.tab.prevent="emit('toggleMode')"
        />
        <div class="flex items-end py-1 pr-1">
          <UButton
            v-if="isRunning"
            icon="i-lucide-square"
            color="error"
            variant="soft"
            size="sm"
            @click="stopGeneration"
          />
          <UButton
            v-else
            icon="i-lucide-send"
            variant="ghost"
            size="sm"
            :disabled="(!input.trim() && !hasPending) || isUploading"
            @click="handleSend"
          />
        </div>
      </div>

      <!-- Mode toggle and hints -->
      <div class="flex items-center justify-between gap-4 text-xs text-muted">
        <button
          v-if="enableModeToggle"
          type="button"
          class="font-medium hover:text-default transition-colors"
          :class="mode === 'plan' ? 'text-warning' : 'text-primary'"
          @click="emit('toggleMode')"
        >
          {{ mode === 'plan' ? 'Plan' : 'Build' }}
        </button>
        <span v-else />
        <span v-if="inputHint">{{ inputHint }}</span>
        <slot name="input-hint" />
      </div>
    </div>
  </div>
</template>
