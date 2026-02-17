<script setup lang="ts">
import type { AIProviderWithModels, AIProviderType, AIModelPurpose } from '~/composables/useAIProviders'

const toast = useToast()

// ─── Settings ────────────────────────────────────────────────────────────────

const { settings, updateSettings } = useSettings()

async function toggleContentCleanup() {
  const newValue = !settings.value?.contentCleanupEnabled
  await updateSettings({ contentCleanupEnabled: newValue })
  toast.add({
    title: newValue ? 'Content cleanup enabled' : 'Content cleanup disabled',
    color: 'success',
    icon: 'i-lucide-check',
  })
}

// ─── Provider Data ───────────────────────────────────────────────────────────

const { providers, pending, refresh } = useAIProviders()

const activeTextModel = computed(() => getActiveTextModel(providers.value))
const activeImageModel = computed(() => getActiveImageModel(providers.value))

// ─── Add Provider Modal ──────────────────────────────────────────────────────

const addProviderModalOpen = ref(false)
const addingProviderType = ref<AIProviderType | null>(null)

// Provider types that haven't been added yet
const availableProviderTypes = computed(() => {
  const existingTypes = new Set(providers.value?.map(p => p.type) ?? [])
  return (Object.keys(AI_PROVIDER_META) as AIProviderType[]).filter(type => !existingTypes.has(type))
})

function openAddProviderModal() {
  addingProviderType.value = null
  addProviderModalOpen.value = true
}

// ─── Configure Provider Modal ────────────────────────────────────────────────

const configureModalOpen = ref(false)
const configuringProvider = ref<AIProviderWithModels | null>(null)

function openConfigureModal(provider: AIProviderWithModels) {
  configuringProvider.value = provider
  configureModalOpen.value = true
}

async function onProviderConfigured() {
  configureModalOpen.value = false
  await refresh()
}

// ─── Add Provider Flow ───────────────────────────────────────────────────────

async function onAddProvider(type: AIProviderType) {
  const meta = AI_PROVIDER_META[type]
  try {
    await createAIProvider({
      type,
      name: meta.label,
      baseUrl: meta.defaultBaseUrl,
    })
    toast.add({ title: `${meta.label} added`, color: 'success', icon: 'i-lucide-check' })
    addProviderModalOpen.value = false
    await refresh()
  }
  catch (error) {
    toast.add({ title: 'Failed to add provider', color: 'error', icon: 'i-lucide-x' })
    console.error(error)
  }
}

// ─── Delete Provider ─────────────────────────────────────────────────────────

const deleteModalOpen = ref(false)
const deletingProvider = ref<AIProviderWithModels | null>(null)

function confirmDelete(provider: AIProviderWithModels) {
  deletingProvider.value = provider
  deleteModalOpen.value = true
}

async function onDelete() {
  if (!deletingProvider.value) return
  try {
    await deleteAIProvider(deletingProvider.value.id)
    toast.add({ title: 'Provider removed', color: 'success', icon: 'i-lucide-check' })
    deleteModalOpen.value = false
    await refresh()
  }
  catch (error) {
    toast.add({ title: 'Failed to remove provider', color: 'error', icon: 'i-lucide-x' })
    console.error(error)
  }
}

// ─── Model Actions ───────────────────────────────────────────────────────────

async function onActivateModel(modelId: string, purpose: AIModelPurpose) {
  try {
    await activateAIModel(modelId)
    toast.add({
      title: `Active ${purpose} model updated`,
      color: 'success',
      icon: 'i-lucide-check',
    })
    await refresh()
  }
  catch (error) {
    toast.add({ title: 'Failed to activate model', color: 'error', icon: 'i-lucide-x' })
    console.error(error)
  }
}
</script>

<template>
  <div class="max-w-5xl space-y-8">
    <!-- Active Models Summary -->
    <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
      <UCard>
        <div class="flex items-center gap-3">
          <div class="flex items-center justify-center size-10 rounded-lg bg-primary/10 shrink-0">
            <UIcon name="i-lucide-message-square" class="size-5 text-primary" />
          </div>
          <div class="min-w-0 flex-1">
            <p class="text-sm text-muted">Active Text Model</p>
            <p v-if="activeTextModel" class="font-medium truncate">
              {{ activeTextModel.model.name }}
              <span class="text-muted font-normal">via {{ AI_PROVIDER_META[activeTextModel.provider.type as AIProviderType]?.label }}</span>
            </p>
            <p v-else class="text-muted italic">None configured</p>
          </div>
        </div>
      </UCard>

      <UCard>
        <div class="flex items-center gap-3">
          <div class="flex items-center justify-center size-10 rounded-lg bg-primary/10 shrink-0">
            <UIcon name="i-lucide-image" class="size-5 text-primary" />
          </div>
          <div class="min-w-0 flex-1">
            <p class="text-sm text-muted">Active Image Model</p>
            <p v-if="activeImageModel" class="font-medium truncate">
              {{ activeImageModel.model.name }}
              <span class="text-muted font-normal">via {{ AI_PROVIDER_META[activeImageModel.provider.type as AIProviderType]?.label }}</span>
            </p>
            <p v-else class="text-muted italic">None configured</p>
          </div>
        </div>
      </UCard>
    </div>

    <!-- Providers Section -->
    <div>
      <div class="flex items-center justify-between mb-4">
        <div>
          <h2 class="text-lg font-semibold">Providers</h2>
          <p class="text-sm text-muted">
            Add API keys for AI providers, then enable the models you want to use.
          </p>
        </div>
        <UButton
          v-if="availableProviderTypes.length > 0"
          icon="i-lucide-plus"
          label="Add Provider"
          @click="openAddProviderModal"
        />
      </div>

      <!-- Empty State -->
      <EmptyState
        v-if="!providers?.length"
        icon="i-lucide-bot"
        title="No providers configured"
        description="Add an AI provider to start using text and image generation."
      >
        <UButton
          icon="i-lucide-plus"
          label="Add Provider"
          @click="openAddProviderModal"
        />
      </EmptyState>

      <!-- Provider List -->
      <div v-else class="space-y-3">
        <AIProviderCard
          v-for="provider in providers"
          :key="provider.id"
          :provider="provider"
          @configure="openConfigureModal(provider)"
          @delete="confirmDelete(provider)"
          @activate-model="onActivateModel"
        />
      </div>
    </div>

    <!-- AI Features Section -->
    <div class="pt-4 border-t border-default">
      <div class="mb-4">
        <h2 class="text-lg font-semibold">AI Features</h2>
        <p class="text-sm text-muted">
          Configure how AI is used throughout the app.
        </p>
      </div>

      <div class="flex items-start justify-between gap-4 p-4 rounded-lg bg-elevated">
        <div>
          <div class="font-medium">Content Cleanup</div>
          <p class="text-sm text-muted mt-1">
            When importing documents to a library, use AI to clean up extracted text by removing page numbers, headers, footers, and other artifacts.
          </p>
        </div>
        <USwitch
          :model-value="settings?.contentCleanupEnabled ?? false"
          :disabled="!activeTextModel"
          @update:model-value="toggleContentCleanup"
        />
      </div>

      <p v-if="!activeTextModel" class="text-xs text-muted mt-2">
        Enable a text model above to use AI features.
      </p>
    </div>
  </div>

  <!-- Add Provider Modal -->
  <UModal
    v-model:open="addProviderModalOpen"
    title="Add Provider"
    description="Select an AI provider to configure."
  >
    <template #body>
      <div class="space-y-2">
        <button
          v-for="type in availableProviderTypes"
          :key="type"
          class="w-full flex items-center gap-3 p-3 rounded-lg hover:bg-elevated transition-colors text-left"
          @click="onAddProvider(type)"
        >
          <div class="flex items-center justify-center size-10 rounded-lg bg-elevated shrink-0">
            <UIcon :name="AI_PROVIDER_META[type].icon" class="size-5" />
          </div>
          <div>
            <p class="font-medium">{{ AI_PROVIDER_META[type].label }}</p>
            <p class="text-sm text-muted">
              {{ AI_PROVIDER_META[type].needsApiKey ? 'Requires API key' : 'Local server' }}
            </p>
          </div>
        </button>
      </div>
    </template>
  </UModal>

  <!-- Configure Provider Modal -->
  <UModal
    v-model:open="configureModalOpen"
    :title="`Configure ${AI_PROVIDER_META[configuringProvider?.type as AIProviderType]?.label ?? 'Provider'}`"
    description="Update API key and manage enabled models."
    :ui="{ width: 'sm:max-w-xl' }"
  >
    <template #body>
      <AIProviderConfigForm
        v-if="configuringProvider"
        :provider="configuringProvider"
        @done="onProviderConfigured"
      />
    </template>
  </UModal>

  <!-- Delete Confirmation -->
  <ConfirmModal
    v-model:open="deleteModalOpen"
    title="Remove Provider"
    :description="`Remove ${AI_PROVIDER_META[deletingProvider?.type as AIProviderType]?.label}? This will also remove all enabled models for this provider.`"
    confirm-label="Remove"
    confirm-color="error"
    @confirm="onDelete"
  />
</template>
