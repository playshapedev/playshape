<script setup lang="ts">
import type { ImageProvider, ImageProviderType } from '~/composables/useImageProviders'

const toast = useToast()

// ─── Provider Data ───────────────────────────────────────────────────────────

const { providers, pending, refresh } = useImageProviders()

// ─── Add/Edit Modal ──────────────────────────────────────────────────────────

const formModalOpen = ref(false)
const editingProvider = ref<ImageProvider | null>(null)
const saving = ref(false)

function openAddModal() {
  editingProvider.value = null
  formModalOpen.value = true
}

function openEditModal(provider: ImageProvider) {
  editingProvider.value = provider
  formModalOpen.value = true
}

async function onFormSubmit(data: {
  name: string
  type: ImageProviderType
  apiKey: string | null
  model: string
}) {
  saving.value = true
  try {
    if (editingProvider.value) {
      await updateImageProvider(editingProvider.value.id, data)
      toast.add({ title: 'Provider updated', color: 'success', icon: 'i-lucide-check' })
    }
    else {
      // First provider is automatically active
      const isFirst = !providers.value || providers.value.length === 0
      await createImageProvider({ ...data, isActive: isFirst } as Parameters<typeof createImageProvider>[0])
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
const deletingProvider = ref<ImageProvider | null>(null)
const deleting = ref(false)

function confirmDelete(provider: ImageProvider) {
  deletingProvider.value = provider
  deleteModalOpen.value = true
}

async function onDelete() {
  if (!deletingProvider.value) return
  deleting.value = true
  try {
    await deleteImageProvider(deletingProvider.value.id)
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

async function onActivate(provider: ImageProvider) {
  try {
    await activateImageProvider(provider.id)
    toast.add({ title: `${provider.name} is now active`, color: 'success', icon: 'i-lucide-check-circle' })
    await refresh()
  }
  catch (error) {
    toast.add({ title: 'Failed to activate provider', color: 'error', icon: 'i-lucide-x' })
    console.error(error)
  }
}
</script>

<template>
  <div class="max-w-5xl">
    <div class="flex items-center justify-between mb-4">
      <div>
        <h2 class="text-lg font-semibold">Image Providers</h2>
        <p class="text-sm text-muted">
          Configure image generation models. You can add multiple providers and switch between them.
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
      icon="i-lucide-image"
      title="No providers configured"
      description="Add an image provider to enable AI image generation."
    >
      <UButton
        icon="i-lucide-plus"
        label="Add Provider"
        @click="openAddModal"
      />
    </EmptyState>

    <!-- Provider List -->
    <div v-else class="space-y-3">
      <ImageProviderCard
        v-for="provider in providers"
        :key="provider.id"
        :provider="provider"
        @edit="openEditModal(provider)"
        @delete="confirmDelete(provider)"
        @activate="onActivate(provider)"
      />
    </div>
  </div>

  <!-- Add/Edit Provider Modal -->
  <UModal
    v-model:open="formModalOpen"
    :title="editingProvider ? 'Edit Provider' : 'Add Provider'"
    :description="editingProvider ? 'Update this provider\'s configuration.' : 'Configure a new image generation provider.'"
  >
    <template #body>
      <ImageProviderForm
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
