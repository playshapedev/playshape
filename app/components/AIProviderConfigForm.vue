<script setup lang="ts">
import type { AIProviderWithModels, AIProviderType, ModelInfo, AIModelPurpose } from '~/composables/useAIProviders'

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
  }
  catch (error) {
    toast.add({ title: 'Failed to save', color: 'error', icon: 'i-lucide-x' })
    console.error(error)
  }
  finally {
    saving.value = false
  }
}

// ─── Model Management ────────────────────────────────────────────────────────

const enabledModelIds = computed(() => new Set(props.provider.models.map(m => m.modelId)))

// Available models grouped by purpose
const textModels = computed(() => meta.value?.availableModels.filter(m => m.purpose === 'text') ?? [])
const imageModels = computed(() => meta.value?.availableModels.filter(m => m.purpose === 'image') ?? [])

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
      <h3 class="font-medium">Models</h3>
      <p class="text-sm text-muted">Select the models you want to use. Click on an enabled model in the provider card to set it as active.</p>

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
            <div>
              <p class="font-medium">{{ model.name }}</p>
              <p v-if="model.description" class="text-sm text-muted">{{ model.description }}</p>
            </div>
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
            <div>
              <p class="font-medium">{{ model.name }}</p>
              <p v-if="model.description" class="text-sm text-muted">{{ model.description }}</p>
            </div>
            <UIcon
              :name="enabledModelIds.has(model.id) ? 'i-lucide-check-circle' : 'i-lucide-circle'"
              :class="enabledModelIds.has(model.id) ? 'text-primary' : 'text-muted'"
              class="size-5 shrink-0"
            />
          </button>
        </div>
      </div>

      <!-- No predefined models (local providers) -->
      <p v-if="textModels.length === 0 && imageModels.length === 0" class="text-sm text-muted italic">
        Models are discovered automatically from the server.
      </p>
    </div>

    <!-- Done button -->
    <div class="flex justify-end pt-2">
      <UButton @click="emit('done')">Done</UButton>
    </div>
  </div>
</template>
