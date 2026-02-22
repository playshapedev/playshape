<script setup lang="ts">
import type { UIMessage } from 'ai'
import type { Chat } from '@ai-sdk/vue'
import type { ChatMode } from '~/utils/chatMode'
import type { AskQuestion, AskQuestionInput } from '~~/server/utils/tools/askQuestion'
import type { InitialTokenUsage } from '~/composables/useDocumentChat'
import { getInitialChatMode } from '~/utils/chatMode'

const props = defineProps<{
  libraryId: string
  documentId: string
  initialMessages: UIMessage[]
  initialTokenUsage?: InitialTokenUsage
}>()

const emit = defineEmits<{
  update: []
}>()

// ─── Chat Mode (Plan / Build) ────────────────────────────────────────────────
// New chats default to Plan mode to encourage planning first.
// Existing chats default to Build mode to not disrupt ongoing work.
// Mode is toggled via Tab key when the input is focused.

const mode = ref<ChatMode>(getInitialChatMode(props.initialMessages.length > 0))

function toggleMode() {
  mode.value = mode.value === 'build' ? 'plan' : 'build'
}

// Wire up the update callback
const documentChat = useDocumentChat(props.libraryId, props.documentId, props.initialMessages, mode, props.initialTokenUsage)
documentChat.onDocumentUpdate.value = () => emit('update')

// Use the chat from the composable
const chatInstance = documentChat.chat as Chat<UIMessage>
const { sendMessage, stopGeneration, tokenUsage } = documentChat

const isRunning = computed(() => chatInstance.status === 'streaming' || chatInstance.status === 'submitted')

const input = ref('')
const textareaRef = ref<{ textareaRef: HTMLTextAreaElement } | null>(null)
const messagesContainer = ref<HTMLElement | null>(null)
const innerWrapperRef = ref<HTMLElement | null>(null)

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
  const msgs = chatInstance.messages
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
  if (!pendingQuestions.value || chatInstance.status === 'streaming' || customInputForQuestion.value) return

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
  // Autofocus the input
  nextTick(() => textareaRef.value?.textareaRef?.focus())
})
onUnmounted(() => {
  window.removeEventListener('keydown', onKeyDown)
})

async function handleSend() {
  if (chatInstance.status !== 'ready') return
  if (!input.value.trim()) return

  const text = input.value.trim()
  input.value = ''

  sendMessage(text)
}

function handleRetry() {
  chatInstance.clearError()
  if (input.value.trim()) {
    handleSend()
  }
}

function formatError(error: Error): string {
  if (error.message.includes('Failed to fetch')) {
    return 'Connection failed. Please check your network and try again.'
  }
  return error.message || 'An unexpected error occurred.'
}

// ─── Bottom-anchored scroll ──────────────────────────────────────────────────

const spacerHeight = ref(0)
const containerHeight = ref(0)
let containerObserver: ResizeObserver | null = null
let contentObserver: ResizeObserver | null = null
let lastContentHeight = 0
const SPACER_PADDING = 16

function updateSpacerHeight() {
  if (!messagesContainer.value || !innerWrapperRef.value) return

  const userMessages = chatInstance.messages.filter(m => m.role === 'user')
  if (!userMessages.length) {
    spacerHeight.value = 0
    return
  }

  const lastUserMsg = userMessages[userMessages.length - 1]!
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

onMounted(() => {
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

  // Scroll to bottom for restored conversations
  if (chatInstance.messages.length && messagesContainer.value) {
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
  containerObserver?.disconnect()
  contentObserver?.disconnect()
})

// Scroll user's latest message to top when sent
let lastMessageCount = chatInstance.messages.length

watch(() => chatInstance.messages.length, (count) => {
  if (count > lastMessageCount) {
    const lastMsg = chatInstance.messages[count - 1]
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
  lastMessageCount = count
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
      <div ref="innerWrapperRef" class="relative min-h-full flex flex-col justify-end p-3 space-y-3">
        <!-- Empty state -->
        <div v-if="!chatInstance.messages.length && chatInstance.status === 'ready'" class="flex-1 flex flex-col items-center justify-center text-center font-mono">
          <UIcon name="i-lucide-file-text" class="size-8 text-muted mb-2" />
          <p class="text-sm text-muted">
            Describe the document you want to create.
          </p>
        </div>

        <!-- Message list -->
        <div v-for="msg in chatInstance.messages" :key="msg.id" :data-message-id="msg.id">
          <div
            class="font-mono text-sm min-w-0 break-words overflow-hidden py-1.5"
            :class="msg.role === 'user'
              ? 'pl-3 border-l-2 border-primary bg-primary/5'
              : ''"
          >
            <template v-for="(part, i) in msg.parts" :key="`${msg.id}-${part.type}-${i}`">
              <!-- Text -->
              <MDC v-if="part.type === 'text' && msg.role === 'assistant'" :value="(part as any).text.trim()" :cache-key="`${msg.id}-${i}`" class="chat-prose *:first:mt-0 *:last:mb-0" />
              <p v-else-if="part.type === 'text'" class="whitespace-pre-wrap">{{ (part as any).text }}</p>

              <!-- fetch_url: loading -->
              <div
                v-else-if="part.type === 'tool-fetch_url' && (part as any).state !== 'output-available'"
                class="flex items-center gap-1.5 text-xs text-muted not-first:mt-1"
              >
                <UIcon name="i-lucide-loader-2" class="size-3.5 animate-spin" />
                Fetching {{ (part as any).input?.url || 'URL' }}...
              </div>

              <!-- fetch_url: done -->
              <div
                v-else-if="part.type === 'tool-fetch_url' && (part as any).state === 'output-available'"
                class="flex items-center gap-1.5 text-xs text-dimmed not-first:mt-1"
              >
                <UIcon
                  :name="(part as any).output?.success ? 'i-lucide-check-circle' : 'i-lucide-alert-circle'"
                  :class="(part as any).output?.success ? 'size-3.5 text-success' : 'size-3.5 text-error'"
                />
                {{ (part as any).output?.success ? `Fetched: ${(part as any).output?.title || 'page'}` : `Failed: ${(part as any).output?.error}` }}
              </div>

              <!-- get_document: loading -->
              <div
                v-else-if="part.type === 'tool-get_document' && (part as any).state !== 'output-available'"
                class="flex items-center gap-1.5 text-xs text-muted not-first:mt-1"
              >
                <UIcon name="i-lucide-loader-2" class="size-3.5 animate-spin" />
                Reading document...
              </div>

              <!-- update_document: loading -->
              <div
                v-else-if="part.type === 'tool-update_document' && (part as any).state !== 'output-available'"
                class="flex items-center gap-1.5 text-xs text-muted not-first:mt-1"
              >
                <UIcon name="i-lucide-loader-2" class="size-3.5 animate-spin" />
                Creating document...
              </div>

              <!-- update_document: done -->
              <div
                v-else-if="part.type === 'tool-update_document' && (part as any).state === 'output-available'"
                class="flex items-center gap-1.5 text-xs not-first:mt-1"
                :class="(part as any).output?.success ? 'text-dimmed' : 'text-muted'"
              >
                <UIcon
                  :name="(part as any).output?.success ? 'i-lucide-check-circle' : 'i-lucide-alert-circle'"
                  :class="(part as any).output?.success ? 'size-3.5 text-success' : 'size-3.5 text-warning'"
                />
                {{ (part as any).output?.success ? 'Document updated' : 'Update failed — retrying...' }}
              </div>

              <!-- patch_document: loading -->
              <div
                v-else-if="part.type === 'tool-patch_document' && (part as any).state !== 'output-available'"
                class="flex items-center gap-1.5 text-xs text-muted not-first:mt-1"
              >
                <UIcon name="i-lucide-loader-2" class="size-3.5 animate-spin" />
                Updating document...
              </div>

              <!-- patch_document: done -->
              <div
                v-else-if="part.type === 'tool-patch_document' && (part as any).state === 'output-available'"
                class="flex items-center gap-1.5 text-xs not-first:mt-1"
                :class="(part as any).output?.success ? 'text-dimmed' : 'text-muted'"
              >
                <UIcon
                  :name="(part as any).output?.success ? 'i-lucide-check-circle' : 'i-lucide-alert-circle'"
                  :class="(part as any).output?.success ? 'size-3.5 text-success' : 'size-3.5 text-warning'"
                />
                {{ (part as any).output?.success ? 'Document updated' : 'Patch failed — retrying...' }}
              </div>

              <!-- ask_question indicator -->
              <div
                v-else-if="part.type === 'tool-ask_question'"
                class="flex items-center gap-1.5 text-xs text-muted not-first:mt-1"
              >
                <UIcon name="i-lucide-message-circle-question" class="size-3.5" />
                {{ (part as any).input?.questions?.[0]?.question || 'Asked a question' }}
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

        <!-- Loading indicator -->
        <div v-if="chatInstance.status === 'submitted'" class="flex items-center gap-2 font-mono text-sm text-muted">
          <UIcon name="i-lucide-loader-2" class="size-4 animate-spin" />
          <span>Thinking...</span>
        </div>

        <!-- Error -->
        <div v-if="chatInstance.error" class="text-sm bg-error/10 rounded-lg p-3 space-y-2">
          <div class="flex items-start gap-2">
            <UIcon name="i-lucide-alert-circle" class="size-4 text-error shrink-0 mt-0.5" />
            <span class="text-error">{{ formatError(chatInstance.error) }}</span>
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
              @click="chatInstance.clearError()"
            />
          </div>
        </div>

        <!-- Bottom spacer -->
        <div v-if="chatInstance.messages.length && spacerHeight > 0" :style="{ minHeight: spacerHeight + 'px' }" aria-hidden="true" />
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

    <!-- Text input (hidden when questions are pending) -->
    <div v-else class="border-t border-default p-3 space-y-2">
      <div
        class="flex gap-2 pl-3 border-l-2 rounded-r-lg transition-colors"
        :class="mode === 'plan'
          ? 'border-warning bg-warning/5'
          : 'border-primary bg-primary/5'"
      >
        <UTextarea
          ref="textareaRef"
          v-model="input"
          placeholder="Describe what you want to create or change..."
          :rows="1"
          autoresize
          autofocus
          class="flex-1 font-mono text-sm"
          variant="none"
          :disabled="isRunning"
          @keydown.enter.exact.prevent="handleSend"
          @keydown.escape="stopGeneration()"
          @keydown.tab.prevent="toggleMode"
        />
        <div class="flex items-end py-1 pr-1">
          <UButton
            v-if="isRunning"
            icon="i-lucide-square"
            variant="soft"
            color="neutral"
            size="sm"
            @click="stopGeneration"
          />
          <UButton
            v-else
            icon="i-lucide-send"
            size="sm"
            :disabled="!input.trim()"
            @click="handleSend"
          />
        </div>
      </div>
      <!-- Mode toggle -->
      <button
        type="button"
        class="text-xs font-medium hover:text-default transition-colors"
        :class="mode === 'plan' ? 'text-warning' : 'text-primary'"
        @click="toggleMode"
      >
        {{ mode === 'plan' ? 'Plan' : 'Build' }}
      </button>
    </div>
  </div>
</template>
