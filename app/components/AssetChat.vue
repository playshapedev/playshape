<script setup lang="ts">
import type { UIMessage } from 'ai'
import type { AIProviderWithModels, AIProviderType } from '~/composables/useAIProviders'

const props = defineProps<{
  assetId: string
  initialMessages: UIMessage[]
}>()

const emit = defineEmits<{
  update: []
}>()

// ─── Image Model Selection ───────────────────────────────────────────────────

const { providers } = useAIProviders()

// Get all enabled image models across all providers
const imageModels = computed(() => {
  if (!providers.value) return []
  const models: Array<{ id: string; name: string; providerLabel: string }> = []
  for (const provider of providers.value) {
    const meta = AI_PROVIDER_META[provider.type as AIProviderType]
    for (const model of provider.models) {
      if (model.purpose === 'image') {
        models.push({
          id: model.modelId,
          name: model.name,
          providerLabel: meta?.label || provider.type,
        })
      }
    }
  }
  return models
})

// Currently selected model ID (defaults to active one)
const selectedModelId = ref<string | undefined>(undefined)

// Auto-select the active image model on load
const activeImageModel = computed(() => getActiveImageModel(providers.value))
watch(activeImageModel, (active) => {
  if (active && !selectedModelId.value) {
    selectedModelId.value = active.model.modelId
  }
}, { immediate: true })

// Model selector items
const modelSelectorItems = computed(() =>
  imageModels.value.map(m => ({
    label: m.name,
    description: m.providerLabel,
    value: m.id,
  })),
)

const selectedModelLabel = computed(() => {
  const model = imageModels.value.find(m => m.id === selectedModelId.value)
  return model ? model.name : 'Select model'
})

// ─── Chat ────────────────────────────────────────────────────────────────────

const { chat, sendMessage, stopGeneration, onAssetUpdate } = useAssetChat(
  props.assetId,
  props.initialMessages,
  selectedModelId,
)

onAssetUpdate.value = () => emit('update')

const isRunning = computed(() => chat.status === 'streaming' || chat.status === 'submitted')

const input = ref('')
const messagesContainer = ref<HTMLElement | null>(null)

function handleSend() {
  if (!input.value.trim() || chat.status !== 'ready') return
  const text = input.value.trim()
  input.value = ''
  sendMessage(text)
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

// Auto-scroll when new messages arrive
watch(() => chat.messages.length, () => {
  nextTick(() => {
    if (messagesContainer.value) {
      messagesContainer.value.scrollTop = messagesContainer.value.scrollHeight
    }
  })
})

// Keyboard shortcut: Escape to stop
function onKeyDown(e: KeyboardEvent) {
  if (e.key === 'Escape' && isRunning.value) {
    e.preventDefault()
    stopGeneration()
  }
}

onMounted(() => window.addEventListener('keydown', onKeyDown))
onUnmounted(() => window.removeEventListener('keydown', onKeyDown))
</script>

<template>
  <div class="flex flex-col h-full overflow-hidden">
    <!-- Model selector header -->
    <div class="border-b border-default p-3 flex items-center gap-2">
      <span class="text-sm text-muted">Model:</span>
      <UDropdownMenu
        :items="modelSelectorItems"
        :ui="{ content: 'w-64' }"
      >
        <UButton
          variant="ghost"
          color="neutral"
          size="sm"
          trailing-icon="i-lucide-chevron-down"
        >
          {{ selectedModelLabel }}
        </UButton>
        <template #item="{ item }">
          <div
            class="flex items-center justify-between w-full"
            @click="selectedModelId = item.value"
          >
            <div>
              <div class="font-medium">{{ item.label }}</div>
              <div class="text-xs text-muted">{{ item.description }}</div>
            </div>
            <UIcon
              v-if="item.value === selectedModelId"
              name="i-lucide-check"
              class="size-4 text-primary"
            />
          </div>
        </template>
      </UDropdownMenu>
    </div>

    <!-- Messages -->
    <div ref="messagesContainer" class="flex-1 overflow-y-auto p-4 space-y-4">
      <!-- Empty state -->
      <div v-if="!chat.messages.length && chat.status === 'ready'" class="h-full flex flex-col items-center justify-center text-center">
        <UIcon name="i-lucide-image" class="size-8 text-muted mb-2" />
        <p class="text-sm text-muted">
          Describe the image you want to create.
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
            class="max-w-[85%] min-w-0 rounded-lg px-3 py-2 text-sm break-words"
            :class="msg.role === 'user'
              ? 'bg-primary text-white'
              : 'bg-elevated'"
          >
            <template v-for="(part, i) in msg.parts" :key="`${msg.id}-${part.type}-${i}`">
              <!-- Text -->
              <MDC v-if="part.type === 'text' && msg.role === 'assistant'" :value="(part as any).text" :cache-key="`${msg.id}-${i}`" class="chat-prose *:first:mt-0 *:last:mb-0" />
              <p v-else-if="part.type === 'text'" class="whitespace-pre-wrap">{{ (part as any).text }}</p>

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

              <!-- Get asset: silently ignore -->
            </template>
          </div>
        </div>
      </div>

      <!-- Loading indicator -->
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

    <!-- Input -->
    <div class="border-t border-default p-4">
      <div class="flex items-end gap-2">
        <UTextarea
          v-model="input"
          placeholder="Describe the image you want..."
          class="flex-1"
          autoresize
          :rows="1"
          :maxrows="6"
          :disabled="isRunning"
          @keydown.enter.exact.prevent="handleSend"
          @keydown.escape="isRunning && stopGeneration()"
        />
        <UButton
          v-if="isRunning"
          icon="i-lucide-square"
          color="error"
          variant="soft"
          @click="stopGeneration"
        />
        <UButton
          v-else
          icon="i-lucide-send"
          :disabled="!input.trim() || !imageModels.length"
          @click="handleSend"
        />
      </div>
      <p v-if="!imageModels.length" class="text-xs text-muted mt-2">
        Enable an image model in Settings > AI Providers to generate images.
      </p>
    </div>
  </div>
</template>
