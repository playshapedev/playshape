<script setup lang="ts">
import type { UIMessage, FileUIPart } from 'ai'
import type { Chat } from '@ai-sdk/vue'
import type { TokenUsageMetadata, InitialTokenUsage } from '~/composables/useTemplateChat'
import type { ChatMode } from '~/utils/chatMode'
import type { AskQuestion, AskQuestionInput } from '~~/server/utils/tools/askQuestion'
import { getInitialChatMode } from '~/utils/chatMode'

/**
 * Tool indicator configuration: maps tool part types to their display info.
 * Each entry defines what to show while a tool is running and when it completes.
 */
export interface ToolIndicator {
  /** Label shown while the tool is executing */
  loadingLabel: string | ((input: Record<string, unknown>) => string)
  /** Label shown when execution completes successfully. Return undefined for silent completion. */
  doneLabel?: string | ((input: Record<string, unknown>, output: Record<string, unknown>) => string | undefined)
  /** Icon shown on completion (defaults to check-circle) */
  doneIcon?: string
  /** Whether to show the failure state with retry messaging */
  showFailure?: boolean
  /** Label shown on failure */
  failLabel?: string
}

const props = withDefaults(defineProps<{
  /** Template ID — used by the default template chat mode */
  templateId?: string
  /** Initial messages to hydrate the chat */
  initialMessages: UIMessage[]
  /** Initial token usage from persisted entity data */
  initialTokenUsage?: InitialTokenUsage
  /** External chat instance — when provided, templateId is ignored */
  chatInstance?: {
    chat: Chat<UIMessage>
    sendMessage: (content: string, files?: FileUIPart[]) => void
    stopGeneration: () => Promise<void>
    reportPreviewError: (error: string) => void
    tokenUsage?: Ref<TokenUsageMetadata>
  }
  /** External mode ref — when provided, used instead of internal mode */
  externalMode?: Ref<ChatMode>
  /** Tool part types that indicate an "update" action (triggers the 'update' emit) */
  updateToolTypes?: string[]
  /** Tool indicator config — maps tool part type (e.g. 'tool-update_template') to display config */
  toolIndicators?: Record<string, ToolIndicator>
  /** Placeholder text for the input */
  placeholder?: string
  /** Empty state message */
  emptyMessage?: string
}>(), {
  templateId: undefined,
  initialTokenUsage: undefined,
  chatInstance: undefined,
  externalMode: undefined,
  updateToolTypes: () => ['tool-update_template', 'tool-patch_component'],
  toolIndicators: () => ({
    'tool-update_template': {
      loadingLabel: 'Updating template...',
      doneLabel: (input: Record<string, unknown>, output: Record<string, unknown>) => {
        if (output?.schemaChangeDetected) {
          const count = output.affectedActivitiesCount as number
          return `Schema change affects ${count} activit${count === 1 ? 'y' : 'ies'}`
        }
        if (output?.versionBumped) return `Template updated to v${output.schemaVersion}`
        return 'Template updated'
      },
      showFailure: true,
      failLabel: 'Update failed — retrying...',
    },
    'tool-patch_component': {
      loadingLabel: 'Patching component...',
      doneLabel: (input: Record<string, unknown>, output: Record<string, unknown>) => {
        if (output?.schemaChangeDetected) {
          const count = output.affectedActivitiesCount as number
          return `Schema change affects ${count} activit${count === 1 ? 'y' : 'ies'}`
        }
        if (output?.versionBumped) return `Template updated to v${output.schemaVersion}`
        return 'Template updated'
      },
      showFailure: true,
      failLabel: 'Patch failed — retrying...',
    },
    'tool-get_template': {
      loadingLabel: 'Reading template...',
      doneLabel: (input: Record<string, unknown>, output: Record<string, unknown>) => {
        if (output?.hasPendingChanges) return 'Template loaded (pending changes)'
        return undefined // silent completion
      },
    },
    'tool-get_reference': {
      loadingLabel: (input: Record<string, unknown>) => `Reading ${input?.topic || 'reference'} docs...`,
      doneLabel: (input: Record<string, unknown>) => `Loaded ${input?.topic || 'reference'} docs`,
      doneIcon: 'i-lucide-book-open',
    },
    'tool-commit_schema_change': {
      loadingLabel: (input: Record<string, unknown>) => {
        if (input?.action === 'migrate') return 'Migrating activities...'
        return 'Updating template version...'
      },
      doneLabel: (input: Record<string, unknown>, output: Record<string, unknown>) => {
        if (!output?.success) return undefined // failure handled separately
        if (input?.action === 'migrate') {
          const count = output.migratedActivities as number
          return `Migrated ${count} activit${count === 1 ? 'y' : 'ies'} to v${output.schemaVersion}`
        }
        const skipped = output.skippedActivities as number
        return `Template v${output.schemaVersion} — ${skipped} activit${skipped === 1 ? 'y stays' : 'ies stay'} on old version`
      },
      doneIcon: 'i-lucide-git-branch',
      showFailure: true,
      failLabel: 'Migration failed — see error details',
    },
  }),
  placeholder: 'Describe your activity...',
  emptyMessage: 'Describe the activity you want to build.',
})

const emit = defineEmits<{
  update: []
}>()

// ─── Chat Mode (Plan / Build) ────────────────────────────────────────────────
// New chats default to Plan mode to encourage planning first.
// Existing chats default to Build mode to not disrupt ongoing work.
// Mode is toggled via Tab key when the input is focused.

const internalMode = ref<ChatMode>(getInitialChatMode(props.initialMessages.length > 0))
const mode = props.externalMode ?? internalMode

function toggleMode() {
  mode.value = mode.value === 'build' ? 'plan' : 'build'
}

// Support both internal (template) and external (activity) chat instances
const templateChat = props.chatInstance
  ? null
  : useTemplateChat(props.templateId!, props.initialMessages, mode, props.initialTokenUsage)

const chat: Chat<UIMessage> = props.chatInstance ? props.chatInstance.chat : templateChat!.chat
const sendMessage: (content: string, files?: FileUIPart[]) => void = props.chatInstance ? props.chatInstance.sendMessage : templateChat!.sendMessage
const stopGeneration: () => Promise<void> = props.chatInstance ? props.chatInstance.stopGeneration : templateChat!.stopGeneration
const reportPreviewError: (error: string) => void = props.chatInstance ? props.chatInstance.reportPreviewError : templateChat!.reportPreviewError

// Token usage tracking
// For internal chat: use the composable's tokenUsage
// For external chat: use provided tokenUsage, or fallback to initial values, or empty
const tokenUsage = templateChat
  ? templateChat.tokenUsage
  : props.chatInstance?.tokenUsage ?? ref<TokenUsageMetadata>({
      totalTokens: props.initialTokenUsage?.totalTokens ?? 0,
      promptTokens: props.initialTokenUsage?.promptTokens ?? 0,
      completionTokens: props.initialTokenUsage?.completionTokens ?? 0,
    })

// Wire up the onFinish callback to emit update events.
// For external chat instances the parent wires onFinish directly — we still emit
// 'update' by watching for update-tool completions in the messages.
if (templateChat) {
  templateChat.onTemplateUpdate.value = () => emit('update')
}

// Expose reportPreviewError so the parent page can forward preview errors
defineExpose({ reportPreviewError })

const isRunning = computed(() => chat.status === 'streaming' || chat.status === 'submitted')

// ─── Image Attachments ───────────────────────────────────────────────────────

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
  handlePaste(event)
}

/**
 * Check if a message is an auto-reported preview error.
 * These are sent to the LLM for self-correction but hidden from the UI.
 */
function isPreviewErrorMessage(msg: UIMessage): boolean {
  if (msg.role !== 'user') return false
  const textPart = msg.parts.find(p => p.type === 'text') as { type: 'text'; text: string } | undefined
  return textPart?.text.startsWith('[Preview Error]') ?? false
}

/**
 * Messages visible to the user — excludes auto-reported preview errors.
 * The full list (chat.messages) is still sent to the LLM so it can see the errors.
 */
const visibleMessages = computed(() =>
  chat.messages.filter(msg => !isPreviewErrorMessage(msg)),
)

const input = ref('')
const textareaRef = ref<{ textareaRef: HTMLTextAreaElement } | null>(null)
const messagesContainer = ref<HTMLElement | null>(null)

// ─── Multi-Question State ────────────────────────────────────────────────────

interface PendingQuestions {
  toolCallId: string
  questions: AskQuestion[]
}

const activeQuestionIndex = ref(0)
const selectedOptionIndex = ref(0)
const answers = ref<Map<string, string>>(new Map())
const customInputForQuestion = ref<string | null>(null)
const customAnswerText = ref('')
const customInputRef = ref<{ el: HTMLInputElement } | null>(null)

/**
 * Find the pending ask_question tool call from the last assistant message.
 * Returns null if there isn't one or if the last message isn't from the assistant.
 */
const pendingQuestions = computed<PendingQuestions | null>(() => {
  const msgs = chat.messages
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

  sendMessage(JSON.stringify({ answers: answersObj }))

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
  // Stop generation and reset state
  stopGeneration()
  answers.value = new Map()
  activeQuestionIndex.value = 0
  selectedOptionIndex.value = 0
  customInputForQuestion.value = null
  customAnswerText.value = ''
  // Refocus the text input
  nextTick(() => {
    textareaRef.value?.textareaRef?.focus()
  })
}

// ─── Keyboard Handling ───────────────────────────────────────────────────────

function onKeyDown(e: KeyboardEvent) {
  // Escape: stop generation or cancel questions
  if (e.key === 'Escape') {
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
      stopGeneration()
      return
    }
  }

  // Rest of keyboard handling only applies when questions are pending
  if (!pendingQuestions.value || chat.status === 'streaming' || customInputForQuestion.value) return

  const questions = pendingQuestions.value.questions

  // Tab / Shift+Tab: switch between question tabs (only if multiple questions)
  if (e.key === 'Tab' && !isSingleQuestion.value) {
    e.preventDefault()
    const maxIndex = showConfirmTab.value ? questions.length : questions.length - 1
    if (e.shiftKey) {
      activeQuestionIndex.value = Math.max(0, activeQuestionIndex.value - 1)
    }
    else {
      activeQuestionIndex.value = Math.min(maxIndex, activeQuestionIndex.value + 1)
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

onMounted(() => {
  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('paste', onPaste)
  // Autofocus the input
  nextTick(() => textareaRef.value?.textareaRef?.focus())
})
onUnmounted(() => {
  window.removeEventListener('keydown', onKeyDown)
  window.removeEventListener('paste', onPaste)
})

async function handleSend() {
  if (chat.status !== 'ready') return
  if (!input.value.trim() && !hasPending.value) return

  const text = input.value.trim()
  input.value = ''

  // Upload attachments if any
  let files: FileUIPart[] | undefined
  if (hasPending.value && props.templateId) {
    try {
      const messageId = crypto.randomUUID()
      files = await uploadAttachments({
        templateId: props.templateId,
        messageId,
      })
    }
    catch {
      // Error is already set in uploadError, don't send the message
      return
    }
  }

  sendMessage(text, files)
}

/**
 * Format error messages for display. Extracts meaningful messages from
 * common AI provider errors (rate limits, auth failures, connection issues).
 */
function formatError(error: Error): string {
  const msg = error.message || 'An unknown error occurred'

  // HTTP status codes from server
  if (msg.includes('409')) return 'No active AI provider configured. Go to Settings to add and activate a provider.'
  if (msg.includes('429') || msg.toLowerCase().includes('rate limit')) return 'Rate limit exceeded. Please wait a moment and try again.'
  if (msg.includes('401') || msg.includes('403') || msg.toLowerCase().includes('unauthorized') || msg.toLowerCase().includes('api key')) return 'Authentication failed. Check your API key in Settings.'
  if (msg.includes('404') && msg.toLowerCase().includes('model')) return 'Model not found. Check your provider configuration in Settings.'
  if (msg.toLowerCase().includes('connection') || msg.toLowerCase().includes('econnrefused') || msg.toLowerCase().includes('fetch failed')) return 'Could not connect to the AI provider. Make sure it is running and accessible.'
  if (msg.toLowerCase().includes('timeout')) return 'Request timed out. The model may be overloaded — try again.'

  return msg
}

/**
 * Retry the last user message after an error.
 */
function handleRetry() {
  chat.clearError()
  // Find the last user message and re-send it
  const msgs = chat.messages
  for (let i = msgs.length - 1; i >= 0; i--) {
    if (msgs[i]!.role === 'user') {
      const textPart = msgs[i]!.parts.find((p: { type: string }) => p.type === 'text') as { type: 'text'; text: string } | undefined
      if (textPart?.text) {
        // Remove the failed user message so it doesn't duplicate
        chat.messages.splice(i)
        sendMessage(textPart.text)
        return
      }
    }
  }
}

// ─── Bottom-anchored scroll layout ───────────────────────────────────────────
// Messages are pushed to the bottom when content is short (via flex justify-end).
// A spacer after the messages provides enough room to scroll the last user message
// to the top of the viewport — the same pattern used by ChatGPT and Claude.
//
// Spacer height is calculated from the last user message's position:
//   spacerHeight = max(0, lastUserMsgOffsetTop + containerHeight - contentHeight - SPACER_PADDING)
// where contentHeight excludes the spacer itself. This ensures the last user
// message can be scrolled exactly to the top with a small padding offset.

const SPACER_PADDING = 40 // px of breathing room below the scrollable area
const containerHeight = ref(0)
const spacerHeight = ref(0)
const innerWrapperRef = ref<HTMLElement | null>(null)
let containerObserver: ResizeObserver | null = null
let contentObserver: ResizeObserver | null = null
let lastContentHeight = 0 // tracks content height excluding spacer to break observer loops

/**
 * Recalculate the bottom spacer height based on the last user message's position.
 * The spacer ensures the last user message can be scrolled to the top of the viewport.
 */
function updateSpacerHeight() {
  if (!messagesContainer.value || !innerWrapperRef.value) {
    spacerHeight.value = 0
    return
  }

  // Find the last visible user message element
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

  // el.offsetTop is relative to the offsetParent (the inner wrapper, which has position: relative)
  const msgTop = el.offsetTop
  const viewportHeight = containerHeight.value

  // Content height without the spacer: total wrapper scrollHeight minus current spacer
  const contentWithoutSpacer = innerWrapperRef.value.scrollHeight - spacerHeight.value

  // The spacer needs to fill enough space so that scrolling puts the user message at the top
  const needed = Math.max(0, msgTop + viewportHeight - contentWithoutSpacer - SPACER_PADDING)

  spacerHeight.value = needed
}

onMounted(() => {
  if (messagesContainer.value) {
    // Track container (viewport) height for spacer calculations
    containerObserver = new ResizeObserver((entries) => {
      for (const entry of entries) {
        containerHeight.value = entry.contentRect.height
      }
      updateSpacerHeight()
    })
    containerObserver.observe(messagesContainer.value)
  }

  if (innerWrapperRef.value) {
    // Track content height changes (e.g., during LLM streaming) to shrink the spacer
    // as the assistant response grows below the last user message.
    // Only recalculate when the content height (excluding the spacer) actually changed,
    // to prevent a ResizeObserver feedback loop where changing the spacer triggers
    // another observation which recalculates the spacer again.
    contentObserver = new ResizeObserver(() => {
      if (!innerWrapperRef.value) return
      const contentHeight = innerWrapperRef.value.scrollHeight - spacerHeight.value
      if (Math.abs(contentHeight - lastContentHeight) < 1) return
      lastContentHeight = contentHeight
      updateSpacerHeight()
    })
    contentObserver.observe(innerWrapperRef.value)
  }

  // Restored conversations: scroll to the bottom of the container (including spacer)
  // so the last user message sits at the top of the viewport. MDC renders async
  // (useAsyncData internally), so we use a MutationObserver to detect when the DOM
  // has stabilized (no mutations for 150ms), then recalculate the spacer and scroll.
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

    // Fallback: if no mutations happen (content already rendered), scroll after a short delay
    debounceTimer = setTimeout(() => {
      observer.disconnect()
      scrollToBottom()
    }, 150)
  }
})

onUnmounted(() => {
  containerObserver?.disconnect()
  contentObserver?.disconnect()
})

// Scroll user's latest message to the top of the view when they send one.
// Don't auto-scroll during assistant streaming — the user can scroll manually.
// Uses visibleMessages so hidden preview error messages don't trigger scrolling.
let lastVisibleCount = visibleMessages.value.length

watch(() => visibleMessages.value.length, (count) => {
  if (count > lastVisibleCount) {
    const lastMsg = visibleMessages.value[count - 1]
    if (lastMsg?.role === 'user') {
      nextTick(() => {
        // Recalculate spacer first so there's room to scroll
        updateSpacerHeight()
        if (!messagesContainer.value) return
        // Need another tick for the spacer DOM update to take effect
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
</script>

<template>
  <div class="flex flex-col h-full overflow-hidden">
    <!-- Header with token usage -->
    <div v-if="tokenUsage.totalTokens || tokenUsage.contextTokens" class="flex justify-end px-3 py-1.5 border-b border-default">
      <ChatTokenUsage
        :total-tokens="tokenUsage.totalTokens"
        :context-tokens="tokenUsage.contextTokens"
        :was-compacted="tokenUsage.wasCompacted"
      />
    </div>

    <!-- Messages (scroll container) -->
    <div ref="messagesContainer" class="flex-1 overflow-y-auto overflow-x-hidden">
      <!-- Inner wrapper: min-h-full + justify-end pushes messages to the bottom
           when content is shorter than the viewport (like mainstream chat UIs) -->
      <div ref="innerWrapperRef" class="relative min-h-full flex flex-col justify-end p-3 space-y-3">
        <!-- Empty state -->
        <div v-if="!visibleMessages.length && chat.status === 'ready'" class="flex-1 flex flex-col items-center justify-center text-center font-mono">
          <UIcon name="i-lucide-message-square" class="size-8 text-muted mb-2" />
          <p class="text-sm text-muted">
            {{ emptyMessage }}
          </p>
        </div>

        <!-- Message list -->
        <div v-for="msg in visibleMessages" :key="msg.id" :data-message-id="msg.id">
          <!-- Terminal-style message: mono font, user messages have left border + subtle bg -->
          <div
            class="font-mono text-sm min-w-0 break-words overflow-hidden py-1.5"
            :class="msg.role === 'user'
              ? 'pl-3 border-l-2 border-primary bg-primary/5'
              : ''"
          >
              <template v-for="(part, i) in msg.parts" :key="`${msg.id}-${part.type}-${i}`">
                <!-- Text (trim to prevent leading whitespace being interpreted as code blocks) -->
                <MDC v-if="part.type === 'text' && msg.role === 'assistant'" :value="(part as any).text.trim()" :cache-key="`${msg.id}-${i}`" class="chat-prose *:first:mt-0 *:last:mb-0" />
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
                    {{ typeof toolIndicators[part.type]!.loadingLabel === 'function'
                      ? (toolIndicators[part.type]!.loadingLabel as Function)((part as any).input ?? {})
                      : toolIndicators[part.type]!.loadingLabel }}
                  </div>

                  <!-- Tool complete with failure detection -->
                  <div
                    v-else-if="toolIndicators[part.type]!.showFailure && (part as any).output?.success === false"
                    class="flex items-center gap-1.5 text-xs text-muted not-first:mt-1"
                  >
                    <UIcon name="i-lucide-alert-circle" class="size-3.5 text-warning" />
                    {{ toolIndicators[part.type]!.failLabel || 'Failed — retrying...' }}
                  </div>

                  <!-- Tool complete (success) — only show if doneLabel evaluates to a truthy value -->
                  <div
                    v-else-if="(() => {
                      const indicator = toolIndicators[part.type]!
                      if (!indicator.doneLabel) return false
                      if (typeof indicator.doneLabel === 'function') {
                        return indicator.doneLabel((part as any).input ?? {}, (part as any).output ?? {})
                      }
                      return indicator.doneLabel
                    })()"
                    class="flex items-center gap-1.5 text-xs text-dimmed not-first:mt-1"
                  >
                    <UIcon
                      :name="toolIndicators[part.type]!.doneIcon || 'i-lucide-check-circle'"
                      class="size-3.5 text-success"
                    />
                    {{ typeof toolIndicators[part.type]!.doneLabel === 'function'
                      ? (toolIndicators[part.type]!.doneLabel as Function)((part as any).input ?? {}, (part as any).output ?? {})
                      : toolIndicators[part.type]!.doneLabel }}
                  </div>

                  <!-- Tool complete with no doneLabel or function returned undefined — render nothing -->
                </template>

                <!-- Tool indicators for tools NOT in config — silently skip -->

                <!-- Ask question indicator -->
                <div
                  v-else-if="part.type === 'tool-ask_question'"
                  class="flex items-center gap-1.5 text-xs text-muted not-first:mt-1"
                >
                  <UIcon name="i-lucide-message-circle-question" class="size-3.5" />
                  {{ (part as any).input?.questions?.[0]?.question || 'Asked a question' }}
                </div>

                <!-- Template update: complete -->
                <div
                  v-else-if="(part.type === 'tool-update_template' || part.type === 'tool-patch_component') && (part as any).state === 'output-available'"
                  class="flex items-center gap-1.5 text-xs text-muted not-first:mt-1"
                >
                  <UIcon
                    :name="(part as any).output?.success === false ? 'i-lucide-alert-circle' : 'i-lucide-check-circle'"
                    :class="(part as any).output?.success === false ? 'size-3.5 text-warning' : 'size-3.5 text-success'"
                  />
                  {{ (part as any).output?.success === false ? 'Patch failed — retrying...' : 'Template updated' }}
                </div>

                <!-- Get template: reading -->
                <div
                  v-else-if="part.type === 'tool-get_template' && (part as any).state !== 'output-available'"
                  class="flex items-center gap-1.5 text-xs text-muted not-first:mt-1"
                >
                  <UIcon name="i-lucide-loader-2" class="size-3.5 animate-spin" />
                  Reading template...
                </div>

                <!-- Get template: done (no need to show anything, but keep it quiet) -->

                <!-- Get reference: loading -->
                <div
                  v-else-if="part.type === 'tool-get_reference' && (part as any).state !== 'output-available'"
                  class="flex items-center gap-1.5 text-xs text-muted not-first:mt-1"
                >
                  <UIcon name="i-lucide-loader-2" class="size-3.5 animate-spin" />
                  Reading {{ (part as any).input?.topic || 'reference' }} docs...
                </div>

                <!-- Get reference: done -->
                <div
                  v-else-if="part.type === 'tool-get_reference' && (part as any).state === 'output-available'"
                  class="flex items-center gap-1.5 text-xs text-dimmed not-first:mt-1"
                >
                  <UIcon name="i-lucide-book-open" class="size-3.5" />
                  Loaded {{ (part as any).input?.topic || 'reference' }} docs
                </div>
              </template>
            </div>
        </div>

        <!-- Compaction message (when context was summarized) -->
        <div
          v-if="tokenUsage.wasCompacted && tokenUsage.compactionMessage"
          class="text-xs text-muted italic py-2 px-3 bg-muted/30 rounded flex items-center gap-2"
        >
          <UIcon name="i-lucide-archive" class="size-3.5 shrink-0" />
          <span>{{ tokenUsage.compactionMessage }}</span>
        </div>

        <!-- Loading indicator (only before any content arrives) -->
        <div v-if="chat.status === 'submitted'" class="flex items-center gap-2 font-mono text-sm text-muted">
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

        <!-- Bottom spacer: provides scrollable room so the last user message
             can be scrolled to the top of the viewport -->
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
        <!-- Confirm tab (only visible when all answered) -->
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
        <!-- Question + options (not on confirm tab) -->
        <template v-if="!isOnConfirmTab && activeQuestion">
          <p class="text-sm">{{ activeQuestion.question }}</p>

          <!-- Options list (hidden when custom input is open for this question) -->
          <div v-if="customInputForQuestion !== activeQuestion.id" class="space-y-1">
            <button
              v-for="(option, index) in activeQuestion.options"
              :key="option.value"
              type="button"
              :class="[
                'w-full text-left px-2 py-1.5 rounded transition-colors',
                answers.get(activeQuestion.id) === option.value
                  ? 'bg-primary/10 text-primary'
                  : selectedOptionIndex === index
                    ? 'bg-accented/75'
                    : 'hover:bg-elevated'
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
            <!-- Type your own answer option -->
            <button
              type="button"
              :class="[
                'w-full text-left px-2 py-1.5 rounded transition-colors',
                selectedOptionIndex === activeQuestion.options.length
                  ? 'bg-accented/75'
                  : 'hover:bg-elevated'
              ]"
              @click="openQuestionCustomInput"
            >
              <div class="flex items-start gap-2">
                <span class="text-muted w-4 shrink-0">{{ activeQuestion.options.length + 1 }}.</span>
                <span class="text-primary">Type your own answer</span>
              </div>
            </button>
          </div>

          <!-- Custom input (when typing own answer) -->
          <div v-else class="flex gap-2">
            <UInput
              ref="customInputRef"
              v-model="customAnswerText"
              placeholder="Type your answer..."
              class="flex-1"
              autofocus
              @keydown.enter="submitQuestionCustomAnswer"
              @keydown.escape="cancelQuestionCustomInput"
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

    <!-- Text input (hidden when question is pending) -->
    <div v-else class="border-t border-default p-4 space-y-3">
      <!-- Pending attachments preview -->
      <div v-if="pendingAttachments.length" class="flex flex-wrap gap-2">
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
      <div v-if="uploadError" class="text-xs text-error flex items-center gap-1">
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
          ref="fileInputRef"
          type="file"
          accept="image/*"
          multiple
          class="hidden"
          @change="onFileSelect"
        >

        <!-- Attachment button -->
        <UButton
          icon="i-lucide-paperclip"
          variant="ghost"
          color="neutral"
          size="sm"
          :disabled="isRunning || isUploading"
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
          :rows="1"
          :maxrows="6"
          :disabled="isRunning || isUploading"
          @keydown.enter.exact.prevent="handleSend"
          @keydown.escape="stopGeneration()"
          @keydown.tab.prevent="toggleMode"
        />
        <div class="flex items-end py-1 pr-1">
          <!-- Stop button while running -->
          <UButton
            v-if="isRunning"
            icon="i-lucide-square"
            color="error"
            variant="soft"
            size="sm"
            @click="stopGeneration"
          />
          <!-- Send button when ready -->
          <UButton
            v-else
            icon="i-lucide-send"
            size="sm"
            :disabled="(!input.trim() && !hasPending) || isUploading"
            @click="handleSend"
          />
        </div>
      </div>
      <!-- Mode toggle and hints -->
      <div class="flex items-center justify-between gap-4 text-xs text-muted">
        <button
          type="button"
          class="font-medium hover:text-default transition-colors"
          :class="mode === 'plan' ? 'text-warning' : 'text-primary'"
          @click="toggleMode"
        >
          {{ mode === 'plan' ? 'Plan' : 'Build' }}
        </button>
        <span>Paste or attach images to include as reference.</span>
      </div>
    </div>
  </div>
</template>
