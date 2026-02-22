<script setup lang="ts">
import type { UIMessage, FileUIPart } from 'ai'
import type { AIProviderType } from '~/composables/useAIProviders'
import type { TokenUsageMetadata } from '~/composables/useAssetChat'
import { ASPECT_RATIOS, DEFAULT_ASPECT_RATIO } from '~/utils/aspectRatios'

const props = defineProps<{
  assetId: string
  initialMessages: UIMessage[]
}>()

const emit = defineEmits<{
  update: []
}>()

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

// ─── Settings (for sticky aspect ratio) ──────────────────────────────────────

const { settings, updateSettings } = useSettings()

// ─── Image Model Selection ───────────────────────────────────────────────────

const { providers } = useAIProviders()

// Get all enabled image models across all providers
// Store both modelId (for generation) and id (for activation)
const imageModels = computed(() => {
  if (!providers.value) return []
  const models: Array<{ id: string; modelId: string; name: string; providerLabel: string }> = []
  for (const provider of providers.value) {
    const meta = AI_PROVIDER_META[provider.type as AIProviderType]
    for (const model of provider.models) {
      if (model.purpose === 'image') {
        models.push({
          id: model.id, // Internal DB id for activation
          modelId: model.modelId, // Model identifier for generation
          name: model.name,
          providerLabel: meta?.label || provider.type,
        })
      }
    }
  }
  return models
})

// Currently selected model ID (the modelId, not the internal id)
const selectedModelId = ref<string | undefined>(undefined)

// Auto-select the active image model on load
const activeImageModel = computed(() => getActiveImageModel(providers.value))
watch(activeImageModel, (active) => {
  if (active && !selectedModelId.value) {
    selectedModelId.value = active.model.modelId
  }
}, { immediate: true })

// When user selects a different model, activate it globally
async function selectModel(modelId: string) {
  if (modelId === selectedModelId.value) return

  selectedModelId.value = modelId

  // Find the model's internal ID and activate it
  const model = imageModels.value.find(m => m.modelId === modelId)
  if (model) {
    try {
      await activateAIModel(model.id)
      // Refresh providers to update the active state
      await refreshNuxtData('/api/settings/ai-providers')
    }
    catch (error) {
      console.error('Failed to activate model:', error)
    }
  }
}

// Model selector items
const modelSelectorItems = computed(() =>
  imageModels.value.map(m => ({
    label: m.name,
    description: m.providerLabel,
    value: m.modelId,
  })),
)

const selectedModelLabel = computed(() => {
  const model = imageModels.value.find(m => m.modelId === selectedModelId.value)
  return model ? model.name : 'Select model'
})

// ─── Aspect Ratio Selection ──────────────────────────────────────────────────

// Initialize from settings (sticky preference)
const selectedAspectRatio = ref(DEFAULT_ASPECT_RATIO)

// Sync with settings when loaded
watch(() => settings.value?.imageAspectRatio, (ratio) => {
  if (ratio) {
    selectedAspectRatio.value = ratio
  }
}, { immediate: true })

// When user selects a different aspect ratio, persist it
async function selectAspectRatio(ratio: string) {
  if (ratio === selectedAspectRatio.value) return

  selectedAspectRatio.value = ratio

  try {
    await updateSettings({ imageAspectRatio: ratio })
  }
  catch (error) {
    console.error('Failed to save aspect ratio preference:', error)
  }
}

// Aspect ratio selector items
const aspectRatioItems = computed(() =>
  ASPECT_RATIOS.map(r => ({
    label: r.label,
    description: r.description,
    value: r.value,
  })),
)

const selectedAspectRatioLabel = computed(() => {
  const ratio = ASPECT_RATIOS.find(r => r.value === selectedAspectRatio.value)
  return ratio ? ratio.label : 'Square'
})

// ─── Chat ────────────────────────────────────────────────────────────────────

const { chat, sendMessage, stopGeneration, onAssetUpdate, tokenUsage } = useAssetChat(
  props.assetId,
  props.initialMessages,
  selectedModelId,
  selectedAspectRatio,
)

onAssetUpdate.value = () => emit('update')

const isRunning = computed(() => chat.status === 'streaming' || chat.status === 'submitted')

const input = ref('')
const customAnswer = ref('')
const showCustomInput = ref(false)
const customInputRef = ref<{ el: HTMLInputElement } | null>(null)
const textareaRef = ref<{ textarea: HTMLTextAreaElement } | null>(null)
const messagesContainer = ref<HTMLElement | null>(null)
const innerWrapperRef = ref<HTMLElement | null>(null)

// Arrow key navigation for question options
const selectedOptionIndex = ref(0)

/**
 * Find the pending ask_question tool call from the last assistant message.
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

// Reset selection when question changes
watch(pendingQuestion, (q) => {
  selectedOptionIndex.value = q ? 0 : 0
})

async function handleSend() {
  if (chat.status !== 'ready') return
  if (!input.value.trim() && !hasPending.value) return

  const text = input.value.trim()
  input.value = ''

  // Upload attachments if any
  let files: FileUIPart[] | undefined
  if (hasPending.value) {
    try {
      const messageId = crypto.randomUUID()
      files = await uploadAttachments({
        assetId: props.assetId,
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

function formatError(error: Error): string {
  const msg = error.message || 'An unknown error occurred'
  if (msg.includes('409')) return 'No AI provider configured. Go to Settings to add a provider.'
  if (msg.includes('429') || msg.toLowerCase().includes('rate limit')) return 'Rate limit exceeded. Please wait and try again.'
  if (msg.includes('401') || msg.includes('403')) return 'Authentication failed. Check your API key in Settings.'
  return msg
}

function handleRetry() {
  chat.clearError()
  const msgs = chat.messages
  for (let i = msgs.length - 1; i >= 0; i--) {
    if (msgs[i]!.role === 'user') {
      const textPart = msgs[i]!.parts.find((p: { type: string }) => p.type === 'text') as { type: 'text'; text: string } | undefined
      if (textPart?.text) {
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

const SPACER_PADDING = 40 // px of breathing room below the scrollable area
const containerHeight = ref(0)
const spacerHeight = ref(0)
let containerObserver: ResizeObserver | null = null
let contentObserver: ResizeObserver | null = null
let lastContentHeight = 0

/**
 * Recalculate the bottom spacer height based on the last user message's position.
 */
function updateSpacerHeight() {
  if (!messagesContainer.value || !innerWrapperRef.value) {
    spacerHeight.value = 0
    return
  }

  // Find the last user message element
  const msgs = chat.messages
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

// Scroll user's latest message to the top of the view when they send one
let lastMessageCount = chat.messages.length

watch(() => chat.messages.length, (count) => {
  if (count > lastMessageCount) {
    const lastMsg = chat.messages[count - 1]
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

// Keyboard shortcuts: number keys, arrows, enter for question options, Escape to stop
function onKeyDown(e: KeyboardEvent) {
  // Escape stops generation
  if (e.key === 'Escape' && isRunning.value) {
    e.preventDefault()
    stopGeneration()
    return
  }

  if (!pendingQuestion.value || chat.status === 'streaming' || showCustomInput.value) return

  const totalOptions = pendingQuestion.value.options.length + 1 // +1 for "Type answer"

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

function onPaste(event: ClipboardEvent) {
  handlePaste(event)
}

onMounted(() => {
  window.addEventListener('keydown', onKeyDown)
  window.addEventListener('paste', onPaste)
  // Autofocus the input
  nextTick(() => textareaRef.value?.textarea?.focus())

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
    contentObserver = new ResizeObserver(() => {
      if (!innerWrapperRef.value) return
      const contentHeight = innerWrapperRef.value.scrollHeight - spacerHeight.value
      if (Math.abs(contentHeight - lastContentHeight) < 1) return
      lastContentHeight = contentHeight
      updateSpacerHeight()
    })
    contentObserver.observe(innerWrapperRef.value)
  }

  // Restored conversations: scroll to the bottom after MDC renders
  if (chat.messages.length && messagesContainer.value) {
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
  window.removeEventListener('paste', onPaste)
  containerObserver?.disconnect()
  contentObserver?.disconnect()
})
</script>

<template>
  <div class="flex flex-col h-full overflow-hidden">
    <!-- Model and aspect ratio selector header -->
    <div class="border-b border-default p-3 flex items-center justify-between">
      <div class="flex items-center gap-4">
      <!-- Model selector -->
      <div class="flex items-center gap-2">
        <span class="text-sm text-muted">Model:</span>
        <UDropdownMenu
          :items="modelSelectorItems"
          :ui="{ content: 'w-64 text-left' }"
        >
          <UButton
            variant="ghost"
            color="neutral"
            size="sm"
            trailing-icon="i-lucide-chevron-down"
            class="max-w-48"
          >
            <span class="truncate">{{ selectedModelLabel }}</span>
          </UButton>
          <template #item="{ item }">
            <div
              class="flex items-center justify-between w-full text-left"
              @click="selectModel(item.value)"
            >
              <div class="text-left">
                <div class="font-medium">{{ item.label }}</div>
                <div class="text-xs text-muted">{{ item.description }}</div>
              </div>
              <UIcon
                v-if="item.value === selectedModelId"
                name="i-lucide-check"
                class="size-4 text-primary shrink-0"
              />
            </div>
          </template>
        </UDropdownMenu>
      </div>

      <!-- Aspect ratio selector -->
      <div class="flex items-center gap-2">
        <span class="text-sm text-muted">Ratio:</span>
        <UDropdownMenu
          :items="aspectRatioItems"
          :ui="{ content: 'w-48' }"
        >
          <UButton
            variant="ghost"
            color="neutral"
            size="sm"
            trailing-icon="i-lucide-chevron-down"
          >
            {{ selectedAspectRatioLabel }}
          </UButton>
          <template #item="{ item }">
            <div
              class="flex items-center justify-between w-full text-left"
              @click="selectAspectRatio(item.value)"
            >
              <div class="flex items-center gap-3 text-left">
                <span class="text-xs text-muted w-10">{{ item.description }}</span>
                <span class="font-medium">{{ item.label }}</span>
              </div>
              <UIcon
                v-if="item.value === selectedAspectRatio"
                name="i-lucide-check"
                class="size-4 text-primary shrink-0"
              />
            </div>
          </template>
        </UDropdownMenu>
      </div>
      </div>

      <!-- Token usage display -->
      <ChatTokenUsage
        v-if="tokenUsage.totalTokens || tokenUsage.contextTokens"
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
        <div v-if="!chat.messages.length && chat.status === 'ready'" class="flex-1 flex flex-col items-center justify-center text-center font-mono">
          <UIcon name="i-lucide-image" class="size-8 text-muted mb-2" />
          <p class="text-sm text-muted">
            Describe the image you want to create.
          </p>
        </div>

        <!-- Message list -->
        <div v-for="msg in chat.messages" :key="msg.id" :data-message-id="msg.id">
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

              <!-- Generate image: in progress -->
              <div
                v-else-if="part.type === 'tool-generate_image' && (part as any).state !== 'output-available'"
                class="flex items-center gap-1.5 text-xs text-muted not-first:mt-2"
              >
                <UIcon name="i-lucide-loader-2" class="size-3.5 animate-spin" />
                Generating image...
              </div>

              <!-- Generate image: complete (success) -->
              <div
                v-else-if="part.type === 'tool-generate_image' && (part as any).state === 'output-available' && (part as any).output?.success"
                class="flex items-center gap-1.5 text-xs text-dimmed not-first:mt-2"
              >
                <UIcon name="i-lucide-check-circle" class="size-3.5 text-success" />
                Image generated
              </div>

              <!-- Generate image: complete (failure) -->
              <div
                v-else-if="part.type === 'tool-generate_image' && (part as any).state === 'output-available' && !(part as any).output?.success"
                class="flex items-center gap-1.5 text-xs not-first:mt-2"
              >
                <UIcon name="i-lucide-alert-circle" class="size-3.5 text-error" />
                <span class="text-error">{{ (part as any).output?.error || 'Generation failed' }}</span>
              </div>

              <!-- Ask question indicator (shown in message history) -->
              <div
                v-else-if="part.type === 'tool-ask_question'"
                class="flex items-center gap-1.5 text-xs text-muted not-first:mt-2"
              >
                <UIcon name="i-lucide-message-circle-question" class="size-3.5" />
                {{ (part as any).input?.question || 'Asked a question' }}
              </div>

              <!-- Get asset: silently ignore -->
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
        <div v-if="chat.messages.length && spacerHeight > 0" :style="{ minHeight: spacerHeight + 'px' }" aria-hidden="true" />
      </div>
    </div>

    <!-- Question buttons (replaces input when AI asks a question) -->
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
      <div class="flex items-end gap-2 pl-3 border-l-2 border-primary bg-primary/5 rounded-r-lg">
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
          placeholder="Describe the image you want..."
          class="flex-1 font-mono text-sm"
          variant="none"
          autoresize
          :rows="1"
          :maxrows="6"
          :disabled="isRunning || isUploading"
          @keydown.enter.exact.prevent="handleSend"
          @keydown.escape="stopGeneration()"
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
            size="sm"
            :disabled="(!input.trim() && !hasPending) || !imageModels.length || isUploading"
            @click="handleSend"
          />
        </div>
      </div>
      <p v-if="!imageModels.length" class="text-xs text-muted">
        Enable an image model in Settings > AI Providers to generate images.
      </p>
      <p v-else class="text-xs text-muted">
        Paste or attach images to include as reference.
      </p>
    </div>
  </div>
</template>
