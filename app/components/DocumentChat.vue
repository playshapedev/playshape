<script setup lang="ts">
import type { UIMessage } from 'ai'
import type { Chat } from '@ai-sdk/vue'
import type { TokenUsageMetadata } from '~/composables/useDocumentChat'

const props = defineProps<{
  libraryId: string
  documentId: string
  initialMessages: UIMessage[]
}>()

const emit = defineEmits<{
  update: []
}>()

// Wire up the update callback
const documentChat = useDocumentChat(props.libraryId, props.documentId, props.initialMessages)
documentChat.onDocumentUpdate.value = () => emit('update')

// Use the chat from the composable
const chatInstance = documentChat.chat as Chat<UIMessage>
const { sendMessage, stopGeneration, tokenUsage } = documentChat

const isRunning = computed(() => chatInstance.status === 'streaming' || chatInstance.status === 'submitted')

const input = ref('')
const customAnswer = ref('')
const showCustomInput = ref(false)
const customInputRef = ref<{ el: HTMLInputElement } | null>(null)
const textareaRef = ref<{ textarea: HTMLTextAreaElement } | null>(null)

// Arrow key navigation for question options
const selectedOptionIndex = ref(0)
const messagesContainer = ref<HTMLElement | null>(null)
const innerWrapperRef = ref<HTMLElement | null>(null)

/**
 * Find the pending ask_question tool call from the last assistant message.
 */
const pendingQuestion = computed(() => {
  const msgs = chatInstance.messages
  if (!msgs.length) return null
  const last = msgs[msgs.length - 1]
  if (!last || last.role !== 'assistant') return null

  for (const part of last.parts) {
    if (part.type === 'tool-ask_question') {
      const p = part as { state: string; toolCallId: string; input: { question: string; options: Array<{ label: string; value: string }> } }
      if (p.state === 'input-available') {
        return {
          toolCallId: p.toolCallId,
          question: p.input.question,
          options: p.input.options,
        }
      }
    }
  }
  return null
})

// Reset selection when question changes
watch(pendingQuestion, () => {
  selectedOptionIndex.value = 0
})

// Keyboard shortcuts
function onKeyDown(e: KeyboardEvent) {
  // Escape stops generation
  if (e.key === 'Escape' && isRunning.value) {
    e.preventDefault()
    stopGeneration()
    return
  }

  if (!pendingQuestion.value || chatInstance.status === 'streaming' || showCustomInput.value) return

  const totalOptions = pendingQuestion.value.options.length + 1

  // Arrow key navigation
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

  // Enter selects the highlighted option
  if (e.key === 'Enter') {
    e.preventDefault()
    if (selectedOptionIndex.value < pendingQuestion.value.options.length) {
      const option = pendingQuestion.value.options[selectedOptionIndex.value]!
      handleAnswer(option.value)
    }
    else {
      openCustomInput()
    }
    return
  }

  // Number keys (1-9) for direct selection
  const num = parseInt(e.key)
  if (num >= 1 && num <= totalOptions) {
    e.preventDefault()
    if (num <= pendingQuestion.value.options.length) {
      const option = pendingQuestion.value.options[num - 1]!
      handleAnswer(option.value)
    }
    else {
      openCustomInput()
    }
  }
}

onMounted(() => {
  window.addEventListener('keydown', onKeyDown)
  // Autofocus the input
  nextTick(() => textareaRef.value?.textarea?.focus())
})
onUnmounted(() => {
  window.removeEventListener('keydown', onKeyDown)
})

async function handleSend() {
  if (chatInstance.status !== 'ready') return
  if (!input.value.trim()) return

  const text = input.value.trim()
  input.value = ''

  documentChat.sendMessage(text)
}

function handleAnswer(value: string) {
  const q = pendingQuestion.value
  if (!q) return
  const selectedLabel = q.options.find(o => o.value === value)?.label || value
  showCustomInput.value = false
  customAnswer.value = ''
  documentChat.sendMessage(selectedLabel)
}

function openCustomInput() {
  showCustomInput.value = true
  customAnswer.value = ''
  nextTick(() => {
    customInputRef.value?.el?.focus()
  })
}

function submitCustomAnswer() {
  if (!customAnswer.value.trim()) return
  documentChat.sendMessage(customAnswer.value.trim())
  showCustomInput.value = false
  customAnswer.value = ''
}

function cancelCustomInput() {
  showCustomInput.value = false
  customAnswer.value = ''
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
                {{ (part as any).input?.question || 'Asked a question' }}
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

    <!-- Question buttons -->
    <div v-if="pendingQuestion" class="border-t border-default p-3 space-y-2 font-mono">
      <p class="text-sm">{{ pendingQuestion.question }}</p>
      <div class="flex flex-wrap gap-1.5">
        <UButton
          v-for="(option, index) in pendingQuestion.options"
          :key="option.value"
          variant="soft"
          color="neutral"
          size="sm"
          :class="selectedOptionIndex === index ? 'bg-accented/75' : ''"
          class="hover:text-primary hover:bg-primary/10"
          :disabled="showCustomInput"
          @click="handleAnswer(option.value)"
        >
          <UKbd :value="String(index + 1)" size="sm" class="mr-1" />
          {{ option.label }}
        </UButton>
        <UButton
          variant="soft"
          color="neutral"
          size="sm"
          :class="selectedOptionIndex === pendingQuestion.options.length ? 'bg-accented/75' : ''"
          class="hover:text-primary hover:bg-primary/10"
          :disabled="showCustomInput"
          @click="openCustomInput"
        >
          <UKbd :value="String(pendingQuestion.options.length + 1)" size="sm" class="mr-1" />
          Type my own answer
        </UButton>
      </div>

      <!-- Custom answer input -->
      <div v-if="showCustomInput" class="flex gap-2">
        <UInput
          ref="customInputRef"
          v-model="customAnswer"
          placeholder="Type your answer..."
          class="flex-1"
          @keydown.enter="submitCustomAnswer"
          @keydown.escape="cancelCustomInput"
        />
        <UButton
          icon="i-lucide-send"
          :disabled="!customAnswer.trim()"
          @click="submitCustomAnswer"
        />
        <UButton
          icon="i-lucide-x"
          variant="ghost"
          color="neutral"
          @click="cancelCustomInput"
        />
      </div>
    </div>

    <!-- Text input (hidden when question is pending) -->
    <div v-else class="border-t border-default p-3">
      <div class="flex gap-2 pl-3 border-l-2 border-primary bg-primary/5 rounded-r-lg">
        <UTextarea
          ref="textareaRef"
          v-model="input"
          placeholder="Describe what you want to create or change..."
          :rows="1"
          autoresize
          class="flex-1 font-mono text-sm"
          variant="none"
          :disabled="isRunning"
          @keydown.enter.exact.prevent="handleSend"
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
    </div>
  </div>
</template>
