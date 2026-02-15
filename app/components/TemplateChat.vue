<script setup lang="ts">
import type { UIMessage } from 'ai'

const props = defineProps<{
  templateId: string
  initialMessages: UIMessage[]
}>()

const emit = defineEmits<{
  update: []
}>()

const {
  chat,
  sendMessage,
  stopGeneration,
  onTemplateUpdate,
  reportPreviewError,
} = useTemplateChat(props.templateId, props.initialMessages)

// Wire up the onFinish callback to emit update events
onTemplateUpdate.value = () => emit('update')

// Expose reportPreviewError so the parent page can forward preview errors
defineExpose({ reportPreviewError })

const isRunning = computed(() => chat.status === 'streaming' || chat.status === 'submitted')

const input = ref('')
const customAnswer = ref('')
const showCustomInput = ref(false)
const customInputRef = ref<{ el: HTMLInputElement } | null>(null)
const messagesContainer = ref<HTMLElement | null>(null)

/**
 * Find the pending ask_question tool call from the last assistant message.
 * Returns null if there isn't one or if the last message isn't from the assistant.
 */
const pendingQuestion = computed(() => {
  const msgs = chat.messages
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

// Keyboard shortcuts for question buttons (1-9) and Escape to stop
function onKeyDown(e: KeyboardEvent) {
  // Escape stops generation
  if (e.key === 'Escape' && isRunning.value) {
    e.preventDefault()
    stopGeneration()
    return
  }

  if (!pendingQuestion.value || chat.status === 'streaming' || showCustomInput.value) return
  const num = parseInt(e.key)
  const totalOptions = pendingQuestion.value.options.length + 1 // +1 for "Type answer"
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

onMounted(() => window.addEventListener('keydown', onKeyDown))
onUnmounted(() => window.removeEventListener('keydown', onKeyDown))

function handleSend() {
  if (!input.value.trim() || chat.status !== 'ready') return
  const text = input.value.trim()
  input.value = ''
  sendMessage(text)
}

function handleAnswer(value: string) {
  const q = pendingQuestion.value
  if (!q) return
  const selectedLabel = q.options.find(o => o.value === value)?.label || value
  showCustomInput.value = false
  customAnswer.value = ''
  sendMessage(selectedLabel)
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
  const text = customAnswer.value.trim()
  showCustomInput.value = false
  customAnswer.value = ''
  sendMessage(text)
}

function cancelCustomInput() {
  showCustomInput.value = false
  customAnswer.value = ''
}

/**
 * Format error messages for display. Extracts meaningful messages from
 * common LLM provider errors (rate limits, auth failures, connection issues).
 */
function formatError(error: Error): string {
  const msg = error.message || 'An unknown error occurred'

  // HTTP status codes from server
  if (msg.includes('409')) return 'No active LLM provider configured. Go to Settings to add and activate a provider.'
  if (msg.includes('429') || msg.toLowerCase().includes('rate limit')) return 'Rate limit exceeded. Please wait a moment and try again.'
  if (msg.includes('401') || msg.includes('403') || msg.toLowerCase().includes('unauthorized') || msg.toLowerCase().includes('api key')) return 'Authentication failed. Check your API key in Settings.'
  if (msg.includes('404') && msg.toLowerCase().includes('model')) return 'Model not found. Check your provider configuration in Settings.'
  if (msg.toLowerCase().includes('connection') || msg.toLowerCase().includes('econnrefused') || msg.toLowerCase().includes('fetch failed')) return 'Could not connect to the LLM provider. Make sure it is running and accessible.'
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
      const textPart = msgs[i]!.parts.find(p => p.type === 'text') as { type: 'text'; text: string } | undefined
      if (textPart?.text) {
        // Remove the failed user message so it doesn't duplicate
        chat.messages.splice(i)
        sendMessage(textPart.text)
        return
      }
    }
  }
}

// Scroll to bottom on mount (for restored conversations)
onMounted(() => {
  nextTick(() => {
    if (messagesContainer.value) {
      messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight
    }
  })
})

// Scroll user's latest message to the top of the view when they send one.
// Don't auto-scroll during assistant streaming.
let lastMessageCount = chat.messages.length

watch(() => chat.messages.length, (count) => {
  if (count > lastMessageCount) {
    const lastMsg = chat.messages[count - 1]
    if (lastMsg?.role === 'user') {
      nextTick(() => {
        if (!messagesContainer.value) return
        const el = messagesContainer.value.querySelector(`[data-message-id="${lastMsg.id}"]`) as HTMLElement | null
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'start' })
        }
      })
    }
  }
  lastMessageCount = count
})
</script>

<template>
  <div class="flex flex-col h-full overflow-hidden">
    <!-- Messages -->
    <div ref="messagesContainer" class="flex-1 overflow-y-auto overflow-x-hidden p-4 space-y-4">
      <!-- Empty state -->
      <div v-if="!chat.messages.length && chat.status === 'ready'" class="flex flex-col items-center justify-center h-full text-center">
        <UIcon name="i-lucide-message-square" class="size-8 text-muted mb-2" />
        <p class="text-sm text-muted">
          Describe the activity you want to build.
        </p>
      </div>

      <!-- Message list -->
      <div v-for="msg in chat.messages" :key="msg.id" :data-message-id="msg.id">
        <div
          class="flex gap-2"
          :class="msg.role === 'user' ? 'justify-end' : 'justify-start'"
        >
          <!-- Avatar -->
          <div v-if="msg.role === 'assistant'" class="shrink-0">
            <div class="size-7 rounded-full bg-primary/10 flex items-center justify-center">
              <UIcon name="i-lucide-sparkles" class="size-4 text-primary" />
            </div>
          </div>

          <!-- Content -->
          <div
            class="max-w-[85%] min-w-0 rounded-lg px-3 py-2 text-sm break-words overflow-hidden"
            :class="msg.role === 'user'
              ? 'bg-primary text-white'
              : 'bg-elevated'"
          >
            <template v-for="(part, i) in msg.parts" :key="`${msg.id}-${part.type}-${i}`">
              <!-- Text -->
              <p v-if="part.type === 'text'" class="whitespace-pre-wrap">{{ (part as any).text }}</p>

              <!-- Template update: in progress -->
              <div
                v-else-if="part.type === 'tool-update_template' && (part as any).state !== 'output-available'"
                class="flex items-center gap-1.5 text-xs text-muted not-first:mt-1"
              >
                <UIcon name="i-lucide-loader-2" class="size-3.5 animate-spin" />
                Updating template...
              </div>

              <!-- Template update: complete -->
              <div
                v-else-if="part.type === 'tool-update_template' && (part as any).state === 'output-available'"
                class="flex items-center gap-1.5 text-xs text-muted not-first:mt-1"
              >
                <UIcon name="i-lucide-check-circle" class="size-3.5 text-success" />
                Template updated
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

              <!-- Ask question indicator -->
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
      </div>

      <!-- Loading indicator (only before any content arrives) -->
      <div v-if="chat.status === 'submitted'" class="flex items-center gap-2 text-sm text-muted">
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
    </div>

    <!-- Question buttons (replaces input when AI asks a question) -->
    <div v-if="pendingQuestion" class="border-t border-default p-4 space-y-3">
      <p class="text-sm font-medium">{{ pendingQuestion.question }}</p>
      <div class="flex flex-wrap gap-2">
        <UButton
          v-for="(option, index) in pendingQuestion.options"
          :key="option.value"
          variant="soft"
          color="neutral"
          :disabled="showCustomInput"
          @click="handleAnswer(option.value)"
        >
          <UKbd :value="String(index + 1)" size="sm" class="mr-1" />
          {{ option.label }}
        </UButton>
        <UButton
          variant="soft"
          color="primary"
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
    <div v-else class="border-t border-default p-4">
      <div class="flex gap-2">
        <UInput
          v-model="input"
          placeholder="Describe your activity..."
          class="flex-1"
          :disabled="isRunning"
          @keydown.enter="handleSend"
          @keydown.escape="isRunning && stopGeneration()"
        />
        <!-- Stop button while running -->
        <UButton
          v-if="isRunning"
          icon="i-lucide-square"
          color="error"
          variant="soft"
          @click="stopGeneration"
        />
        <!-- Send button when ready -->
        <UButton
          v-else
          icon="i-lucide-send"
          :disabled="!input.trim()"
          @click="handleSend"
        />
      </div>
    </div>
  </div>
</template>
