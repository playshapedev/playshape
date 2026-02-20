<script setup lang="ts">
import type { UIMessage, FileUIPart } from 'ai'
import type { Chat } from '@ai-sdk/vue'

/**
 * Tool indicator configuration: maps tool part types to their display info.
 * Each entry defines what to show while a tool is running and when it completes.
 */
export interface ToolIndicator {
  /** Label shown while the tool is executing */
  loadingLabel: string | ((input: Record<string, unknown>) => string)
  /** Label shown when execution completes successfully */
  doneLabel?: string | ((input: Record<string, unknown>, output: Record<string, unknown>) => string)
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
  /** External chat instance — when provided, templateId is ignored */
  chatInstance?: {
    chat: Chat<UIMessage>
    sendMessage: (content: string, files?: FileUIPart[]) => void
    stopGeneration: () => Promise<void>
    reportPreviewError: (error: string) => void
  }
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
  chatInstance: undefined,
  updateToolTypes: () => ['tool-update_template', 'tool-patch_component'],
  toolIndicators: () => ({
    'tool-update_template': {
      loadingLabel: 'Updating template...',
      doneLabel: 'Template updated',
      showFailure: true,
      failLabel: 'Patch failed — retrying...',
    },
    'tool-patch_component': {
      loadingLabel: 'Patching component...',
      doneLabel: 'Template updated',
      showFailure: true,
      failLabel: 'Patch failed — retrying...',
    },
    'tool-get_template': {
      loadingLabel: 'Reading template...',
    },
    'tool-get_reference': {
      loadingLabel: (input: Record<string, unknown>) => `Reading ${input?.topic || 'reference'} docs...`,
      doneLabel: (input: Record<string, unknown>) => `Loaded ${input?.topic || 'reference'} docs`,
      doneIcon: 'i-lucide-book-open',
    },
  }),
  placeholder: 'Describe your activity...',
  emptyMessage: 'Describe the activity you want to build.',
})

const emit = defineEmits<{
  update: []
}>()

// Support both internal (template) and external (activity) chat instances
const templateChat = props.chatInstance
  ? null
  : useTemplateChat(props.templateId!, props.initialMessages)

const chat: Chat<UIMessage> = props.chatInstance ? props.chatInstance.chat : templateChat!.chat
const sendMessage: (content: string, files?: FileUIPart[]) => void = props.chatInstance ? props.chatInstance.sendMessage : templateChat!.sendMessage
const stopGeneration: () => Promise<void> = props.chatInstance ? props.chatInstance.stopGeneration : templateChat!.stopGeneration
const reportPreviewError: (error: string) => void = props.chatInstance ? props.chatInstance.reportPreviewError : templateChat!.reportPreviewError

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

onMounted(() => {
  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('paste', onPaste)
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
    <!-- Messages (scroll container) -->
    <div ref="messagesContainer" class="flex-1 overflow-y-auto overflow-x-hidden">
      <!-- Inner wrapper: min-h-full + justify-end pushes messages to the bottom
           when content is shorter than the viewport (like mainstream chat UIs) -->
      <div ref="innerWrapperRef" class="relative min-h-full flex flex-col justify-end p-4 space-y-4">
        <!-- Empty state -->
        <div v-if="!visibleMessages.length && chat.status === 'ready'" class="flex-1 flex flex-col items-center justify-center text-center">
          <UIcon name="i-lucide-message-square" class="size-8 text-muted mb-2" />
          <p class="text-sm text-muted">
            {{ emptyMessage }}
          </p>
        </div>

        <!-- Message list -->
        <div v-for="msg in visibleMessages" :key="msg.id" :data-message-id="msg.id">
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
                ? 'bg-brand-orange-700 text-white'
                : 'bg-elevated dark:bg-playshape-800/60'"
            >
              <template v-for="(part, i) in msg.parts" :key="`${msg.id}-${part.type}-${i}`">
                <!-- Text -->
                <MDC v-if="part.type === 'text' && msg.role === 'assistant'" :value="(part as any).text" :cache-key="`${msg.id}-${i}`" class="chat-prose *:first:mt-0 *:last:mb-0" />
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

                  <!-- Tool complete (success) — only show if doneLabel is defined -->
                  <div
                    v-else-if="toolIndicators[part.type]!.doneLabel"
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

                  <!-- Tool complete with no doneLabel — render nothing (silent completion) -->
                </template>

                <!-- Tool indicators for tools NOT in config — silently skip -->

                <!-- Ask question indicator -->
                <div
                  v-else-if="part.type === 'tool-ask_question'"
                  class="flex items-center gap-1.5 text-xs text-muted not-first:mt-1"
                >
                  <UIcon name="i-lucide-message-circle-question" class="size-3.5" />
                  {{ (part as any).input?.question || 'Asked a question' }}
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

        <!-- Bottom spacer: provides scrollable room so the last user message
             can be scrolled to the top of the viewport -->
        <div v-if="visibleMessages.length && spacerHeight > 0" :style="{ minHeight: spacerHeight + 'px' }" aria-hidden="true" />
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
      <div class="flex items-end gap-2">
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
          :disabled="isRunning || isUploading"
          @click="openFilePicker"
        />

        <UTextarea
          v-model="input"
          :placeholder="placeholder"
          class="flex-1"
          autoresize
          :rows="1"
          :maxrows="6"
          :disabled="isRunning || isUploading"
          @keydown.enter.exact.prevent="handleSend"
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
          :disabled="(!input.trim() && !hasPending) || isUploading"
          @click="handleSend"
        />
      </div>
      <p class="text-xs text-muted">
        Paste or attach images to include as reference.
      </p>
    </div>
  </div>
</template>
