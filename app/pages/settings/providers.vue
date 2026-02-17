<script setup lang="ts">
import type { LLMProvider } from '~/composables/useLLMProviders'

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

const { providers, pending, refresh } = useLLMProviders()

// ─── Add/Edit Modal ──────────────────────────────────────────────────────────

const formModalOpen = ref(false)
const editingProvider = ref<LLMProvider | null>(null)
const saving = ref(false)

function openAddModal() {
  editingProvider.value = null
  formModalOpen.value = true
}

function openEditModal(provider: LLMProvider) {
  editingProvider.value = provider
  formModalOpen.value = true
}

async function onFormSubmit(data: {
  name: string
  type: LLMProviderType
  baseUrl: string | null
  apiKey: string | null
  model: string
}) {
  saving.value = true
  try {
    if (editingProvider.value) {
      await updateLLMProvider(editingProvider.value.id, data)
      toast.add({ title: 'Provider updated', color: 'success', icon: 'i-lucide-check' })
    }
    else {
      // First provider is automatically active
      const isFirst = !providers.value || providers.value.length === 0
      await createLLMProvider({ ...data, isActive: isFirst } as Parameters<typeof createLLMProvider>[0])
      toast.add({ title: 'Provider added', color: 'success', icon: 'i-lucide-check' })
    }
    formModalOpen.value = false
    await refresh()
  }
  catch (error) {
    toast.add({ title: 'Failed to save provider', color: 'error', icon: 'i-lucide-x' })
    console.error(error)
  }
  finally {
    saving.value = false
  }
}

// ─── Delete ──────────────────────────────────────────────────────────────────

const deleteModalOpen = ref(false)
const deletingProvider = ref<LLMProvider | null>(null)
const deleting = ref(false)

function confirmDelete(provider: LLMProvider) {
  deletingProvider.value = provider
  deleteModalOpen.value = true
}

async function onDelete() {
  if (!deletingProvider.value) return
  deleting.value = true
  try {
    await deleteLLMProvider(deletingProvider.value.id)
    toast.add({ title: 'Provider deleted', color: 'success', icon: 'i-lucide-check' })
    deleteModalOpen.value = false
    await refresh()
  }
  catch (error) {
    toast.add({ title: 'Failed to delete provider', color: 'error', icon: 'i-lucide-x' })
    console.error(error)
  }
  finally {
    deleting.value = false
  }
}

// ─── Activate ────────────────────────────────────────────────────────────────

async function onActivate(provider: LLMProvider) {
  try {
    await activateLLMProvider(provider.id)
    toast.add({ title: `${provider.name} is now active`, color: 'success', icon: 'i-lucide-check-circle' })
    await refresh()
  }
  catch (error) {
    toast.add({ title: 'Failed to activate provider', color: 'error', icon: 'i-lucide-x' })
    console.error(error)
  }
}

// ─── Test ────────────────────────────────────────────────────────────────────

const testingId = ref<string | null>(null)

async function onTest(provider: LLMProvider) {
  testingId.value = provider.id
  try {
    await testLLMProvider({
      type: provider.type as Parameters<typeof testLLMProvider>[0]['type'],
      baseUrl: provider.baseUrl,
      apiKey: provider.apiKey,
      model: provider.model,
    })
    toast.add({ title: `${provider.name} connected successfully`, color: 'success', icon: 'i-lucide-check-circle' })
  }
  catch (error: unknown) {
    let message = 'Connection test failed'
    if (error && typeof error === 'object' && 'data' in error) {
      const data = (error as { data?: { message?: string } }).data
      message = data?.message || message
    }
    toast.add({ title: message, color: 'error', icon: 'i-lucide-x-circle' })
  }
  finally {
    testingId.value = null
  }
}
</script>

<template>
  <div class="max-w-5xl">
    <div class="flex items-center justify-between mb-4">
      <div>
        <h2 class="text-lg font-semibold">AI Providers</h2>
        <p class="text-sm text-muted">
          Configure AI models for activity generation. You can add multiple providers and switch between them.
        </p>
      </div>
      <UButton
        v-if="providers?.length"
        icon="i-lucide-plus"
        label="Add Provider"
        @click="openAddModal"
      />
    </div>

    <!-- Loading -->
    <div v-if="pending" class="space-y-3">
      <USkeleton class="h-20 w-full" />
      <USkeleton class="h-20 w-full" />
    </div>

    <!-- Empty State -->
    <EmptyState
      v-else-if="!providers?.length"
      icon="i-lucide-bot"
      title="No providers configured"
      description="Add an AI provider to start generating AI-powered activities."
    >
      <UButton
        icon="i-lucide-plus"
        label="Add Provider"
        @click="openAddModal"
      />
    </EmptyState>

    <!-- Provider List -->
    <div v-else class="space-y-3">
      <ProviderCard
        v-for="provider in providers"
        :key="provider.id"
        :provider="provider"
        @edit="openEditModal(provider)"
        @delete="confirmDelete(provider)"
        @activate="onActivate(provider)"
        @test="onTest(provider)"
      />
    </div>

    <!-- AI Features Section -->
    <div class="mt-10 pt-8 border-t border-default">
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
            When importing documents to a library, use AI to clean up extracted text by removing page numbers, headers, footers, copyright notices, and other artifacts.
          </p>
        </div>
        <USwitch
          :model-value="settings?.contentCleanupEnabled ?? false"
          :disabled="!providers?.length"
          @update:model-value="toggleContentCleanup"
        />
      </div>

      <p v-if="!providers?.length" class="text-xs text-muted mt-2">
        Add an AI provider above to enable AI features.
      </p>
    </div>
  </div>

  <!-- Add/Edit Provider Modal -->
  <UModal
    v-model:open="formModalOpen"
    :title="editingProvider ? 'Edit Provider' : 'Add Provider'"
    :description="editingProvider ? 'Update this provider\'s configuration.' : 'Configure a new AI provider for activity generation.'"
  >
    <template #body>
      <ProviderForm
        :provider="editingProvider"
        @submit="onFormSubmit"
        @cancel="formModalOpen = false"
      />
    </template>
  </UModal>

  <!-- Delete Confirmation -->
  <ConfirmModal
    v-model:open="deleteModalOpen"
    title="Delete Provider"
    :description="`Are you sure you want to delete &quot;${deletingProvider?.name}&quot;? This action cannot be undone.`"
    confirm-label="Delete"
    confirm-color="error"
    :loading="deleting"
    @confirm="onDelete"
  />
</template>
