<script setup lang="ts">
import type { AIProviderWithModels, AIProviderType, ModelInfo } from '~/composables/useAIProviders'

const props = defineProps<{
  provider: AIProviderWithModels
}>()

const emit = defineEmits<{
  done: []
}>()

const toast = useToast()

const meta = computed(() => AI_PROVIDER_META[props.provider.type as AIProviderType])

// ─── Form State ──────────────────────────────────────────────────────────────

const apiKey = ref(props.provider.apiKey ?? '')
const baseUrl = ref(props.provider.baseUrl ?? meta.value?.defaultBaseUrl ?? '')
const saving = ref(false)

async function saveCredentials() {
  saving.value = true
  try {
    await updateAIProvider(props.provider.id, {
      apiKey: apiKey.value || null,
      baseUrl: baseUrl.value || null,
    })
    toast.add({ title: 'Credentials saved', color: 'success', icon: 'i-lucide-check' })
    // Refresh models after saving credentials (API key might enable more models)
    await fetchModels()
  }
  catch (error) {
    toast.add({ title: 'Failed to save', color: 'error', icon: 'i-lucide-x' })
    console.error(error)
  }
  finally {
    saving.value = false
  }
}

// ─── Model Discovery ─────────────────────────────────────────────────────────

const availableModels = ref<ModelInfo[]>([])
const loadingModels = ref(false)
const modelError = ref('')

async function fetchModels() {
  loadingModels.value = true
  modelError.value = ''
  try {
    availableModels.value = await discoverModels(props.provider.id)
  }
  catch (error: unknown) {
    console.error('Failed to fetch models:', error)
    if (error && typeof error === 'object' && 'data' in error) {
      const data = (error as { data?: { message?: string } }).data
      modelError.value = data?.message || 'Failed to fetch models'
    }
    else {
      modelError.value = 'Failed to fetch models'
    }
  }
  finally {
    loadingModels.value = false
  }
}

// Fetch models on mount
onMounted(() => {
  fetchModels()
})

// ─── Model Management ────────────────────────────────────────────────────────

const enabledModelIds = computed(() => new Set(props.provider.models.map(m => m.modelId)))

// Search filter
const modelSearch = ref('')

// Available models grouped by purpose, filtered by search
const textModels = computed(() => {
  const search = modelSearch.value.toLowerCase().trim()
  return availableModels.value
    .filter(m => m.purpose === 'text')
    .filter(m => !search || m.name.toLowerCase().includes(search) || m.id.toLowerCase().includes(search))
})

const imageModels = computed(() => {
  const search = modelSearch.value.toLowerCase().trim()
  return availableModels.value
    .filter(m => m.purpose === 'image')
    .filter(m => !search || m.name.toLowerCase().includes(search) || m.id.toLowerCase().includes(search))
})

async function toggleModel(model: ModelInfo) {
  const isEnabled = enabledModelIds.value.has(model.id)

  if (isEnabled) {
    // Find the model record and remove it
    const modelRecord = props.provider.models.find(m => m.modelId === model.id)
    if (modelRecord) {
      try {
        await removeAIModel(modelRecord.id)
        toast.add({ title: `${model.name} disabled`, color: 'success', icon: 'i-lucide-check' })
        emit('done') // Trigger refresh
      }
      catch (error) {
        toast.add({ title: 'Failed to disable model', color: 'error', icon: 'i-lucide-x' })
        console.error(error)
      }
    }
  }
  else {
    // Add the model
    try {
      // Make it active if it's the first model of this purpose
      const existingOfPurpose = props.provider.models.filter(m => m.purpose === model.purpose)
      const isFirst = existingOfPurpose.length === 0

      await addAIModel({
        providerId: props.provider.id,
        modelId: model.id,
        name: model.name,
        purpose: model.purpose,
        isActive: isFirst,
      })
      toast.add({ title: `${model.name} enabled`, color: 'success', icon: 'i-lucide-check' })
      emit('done') // Trigger refresh
    }
    catch (error) {
      toast.add({ title: 'Failed to enable model', color: 'error', icon: 'i-lucide-x' })
      console.error(error)
    }
  }
}
</script>

<template>
  <div class="space-y-6">
    <!-- Credentials -->
    <div class="space-y-4">
      <h3 class="font-medium">Credentials</h3>

      <!-- API Key -->
      <div v-if="meta?.needsApiKey" class="space-y-1">
        <label class="text-sm font-medium">API Key</label>
        <div class="flex gap-2">
          <UInput
            v-model="apiKey"
            type="password"
            placeholder="sk-..."
            class="flex-1"
          />
          <UButton
            :loading="saving"
            @click="saveCredentials"
          >
            Save
          </UButton>
        </div>
        <p class="text-xs text-muted">Stored locally on this device only.</p>
      </div>

      <!-- Base URL -->
      <div v-if="meta?.needsBaseUrl" class="space-y-1">
        <label class="text-sm font-medium">Server URL</label>
        <div class="flex gap-2">
          <UInput
            v-model="baseUrl"
            :placeholder="meta.defaultBaseUrl ?? ''"
            class="flex-1"
          />
          <UButton
            :loading="saving"
            @click="saveCredentials"
          >
            Save
          </UButton>
        </div>
      </div>
    </div>

    <!-- Models -->
    <div class="space-y-4">
      <div class="flex items-center justify-between">
        <h3 class="font-medium">Models</h3>
        <UButton
          icon="i-lucide-refresh-cw"
          variant="ghost"
          color="neutral"
          size="xs"
          :loading="loadingModels"
          @click="fetchModels"
        >
          Refresh
        </UButton>
      </div>
      <p class="text-sm text-muted">Select the models you want to use. Click on an enabled model in the provider card to set it as active.</p>

      <!-- Search -->
      <UInput
        v-if="availableModels.length > 5"
        v-model="modelSearch"
        icon="i-lucide-search"
        placeholder="Search models..."
        class="w-full"
      />

      <!-- Loading -->
      <div v-if="loadingModels && availableModels.length === 0" class="space-y-2">
        <USkeleton class="h-12 w-full" />
        <USkeleton class="h-12 w-full" />
        <USkeleton class="h-12 w-full" />
      </div>

      <!-- Error -->
      <div v-else-if="modelError" class="p-4 rounded-lg bg-error/10 text-error text-sm">
        {{ modelError }}
      </div>

      <template v-else>
        <!-- Text Models -->
        <div v-if="textModels.length > 0" class="space-y-2">
          <p class="text-xs font-medium text-muted uppercase tracking-wide">Text Generation</p>
          <div class="space-y-1">
            <button
              v-for="model in textModels"
              :key="model.id"
              class="w-full flex items-center justify-between p-3 rounded-lg hover:bg-elevated transition-colors text-left"
              @click="toggleModel(model)"
            >
              <span class="font-medium">{{ model.name }}</span>
              <UIcon
                :name="enabledModelIds.has(model.id) ? 'i-lucide-check-circle' : 'i-lucide-circle'"
                :class="enabledModelIds.has(model.id) ? 'text-primary' : 'text-muted'"
                class="size-5 shrink-0"
              />
            </button>
          </div>
        </div>

        <!-- Image Models -->
        <div v-if="imageModels.length > 0" class="space-y-2">
          <p class="text-xs font-medium text-muted uppercase tracking-wide">Image Generation</p>
          <div class="space-y-1">
            <button
              v-for="model in imageModels"
              :key="model.id"
              class="w-full flex items-center justify-between p-3 rounded-lg hover:bg-elevated transition-colors text-left"
              @click="toggleModel(model)"
            >
              <span class="font-medium">{{ model.name }}</span>
              <UIcon
                :name="enabledModelIds.has(model.id) ? 'i-lucide-check-circle' : 'i-lucide-circle'"
                :class="enabledModelIds.has(model.id) ? 'text-primary' : 'text-muted'"
                class="size-5 shrink-0"
              />
            </button>
          </div>
        </div>

        <!-- No models found -->
        <p v-if="!loadingModels && textModels.length === 0 && imageModels.length === 0" class="text-sm text-muted italic">
          No models found. Make sure the server is running or check your API key.
        </p>
      </template>
    </div>

    <!-- Done button -->
    <div class="flex justify-end pt-2">
      <UButton @click="emit('done')">Done</UButton>
    </div>
  </div>
</template>
