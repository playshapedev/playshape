<script setup lang="ts">
import type { UIMessage, ToolIndicator, InitialTokenUsage } from '~/types/chat'
import type { AIProviderType } from '~/composables/useAIProviders'
import type { ChatMode } from '~/utils/chatMode'
import { getInitialChatMode } from '~/utils/chatMode'
import { ASPECT_RATIOS, DEFAULT_ASPECT_RATIO } from '~/utils/aspectRatios'

const props = defineProps<{
  assetId: string
  initialMessages: UIMessage[]
  initialTokenUsage?: InitialTokenUsage
}>()

const emit = defineEmits<{
  update: []
}>()

// ─── Settings (for sticky aspect ratio) ──────────────────────────────────────

const { settings, updateSettings } = useSettings()

// ─── Image Model Selection ───────────────────────────────────────────────────

const { providers } = useAIProviders()

const imageModels = computed(() => {
  if (!providers.value) return []
  const models: Array<{ id: string; modelId: string; name: string; providerLabel: string }> = []
  for (const provider of providers.value) {
    const meta = AI_PROVIDER_META[provider.type as AIProviderType]
    for (const model of provider.models) {
      if (model.purpose === 'image') {
        models.push({
          id: model.id,
          modelId: model.modelId,
          name: model.name,
          providerLabel: meta?.label || provider.type,
        })
      }
    }
  }
  return models
})

const selectedModelId = ref<string | undefined>(undefined)

const activeImageModel = computed(() => getActiveImageModel(providers.value))
watch(activeImageModel, (active) => {
  if (active && !selectedModelId.value) {
    selectedModelId.value = active.model.modelId
  }
}, { immediate: true })

async function selectModel(modelId: string) {
  if (modelId === selectedModelId.value) return

  selectedModelId.value = modelId

  const model = imageModels.value.find(m => m.modelId === modelId)
  if (model) {
    try {
      await activateAIModel(model.id)
      await refreshNuxtData('/api/settings/ai-providers')
    }
    catch (error) {
      console.error('Failed to activate model:', error)
    }
  }
}

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

const selectedAspectRatio = ref(DEFAULT_ASPECT_RATIO)

watch(() => settings.value?.imageAspectRatio, (ratio) => {
  if (ratio) {
    selectedAspectRatio.value = ratio
  }
}, { immediate: true })

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

// ─── Chat Mode (Plan / Build) ────────────────────────────────────────────────

const mode = ref<ChatMode>(getInitialChatMode(props.initialMessages.length > 0))

function toggleMode() {
  mode.value = mode.value === 'build' ? 'plan' : 'build'
}

// ─── Chat Instance ───────────────────────────────────────────────────────────

const { chat, sendMessage, stopGeneration, onAssetUpdate, tokenUsage, messageQueue, clearQueue } = useAssetChat(
  props.assetId,
  props.initialMessages,
  selectedModelId,
  selectedAspectRatio,
  mode,
  props.initialTokenUsage,
)

onAssetUpdate.value = () => emit('update')

// ─── Tool Indicators ─────────────────────────────────────────────────────────

const toolIndicators: Record<string, ToolIndicator> = {
  'tool-generate_image': {
    loadingLabel: 'Generating image...',
    doneLabel: (input: Record<string, unknown>, output: Record<string, unknown>) => {
      return output?.success ? 'Image generated' : undefined
    },
    showFailure: true,
    failLabel: 'Generation failed',
  },
}

// ─── Input hint ──────────────────────────────────────────────────────────────

const inputHint = computed(() => {
  if (!imageModels.value.length) {
    return 'Enable an image model in Settings > AI Providers to generate images.'
  }
  return 'Paste or attach images to include as reference.'
})
</script>

<template>
  <BaseChat
    :chat="chat"
    :send-message="sendMessage"
    :stop-generation="stopGeneration"
    :token-usage="tokenUsage"
    :mode="mode"
    :message-queue="messageQueue"
    :clear-queue="clearQueue"
    :enable-attachments="true"
    :enable-mode-toggle="true"
    placeholder="Describe the image you want..."
    empty-icon="i-lucide-image"
    empty-message="Describe the image you want to create."
    :tool-indicators="toolIndicators"
    :input-hint="inputHint"
    :attachment-entity-id="assetId"
    attachment-entity-type="asset"
    @toggle-mode="toggleMode"
    @update="emit('update')"
  >
    <!-- Custom header with model and aspect ratio selectors -->
    <template #header>
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
    </template>
  </BaseChat>
</template>
