<script setup lang="ts">
const router = useRouter()
const toast = useToast()

const { assets, pending, refresh } = useAssets()

// ─── Create Image ────────────────────────────────────────────────────────────

const creating = ref(false)

async function handleCreateImage() {
  creating.value = true
  try {
    const asset = await createAsset({ name: 'New Image' })
    await router.push(`/assets/${asset.id}`)
  }
  catch (error) {
    toast.add({ title: 'Failed to create image', color: 'error' })
    console.error(error)
  }
  finally {
    creating.value = false
  }
}

// ─── Upload ──────────────────────────────────────────────────────────────────

const fileInputRef = ref<HTMLInputElement | null>(null)
const uploading = ref(false)

function openFileDialog() {
  fileInputRef.value?.click()
}

async function handleFileSelect(event: Event) {
  const input = event.target as HTMLInputElement
  const files = input.files
  if (!files?.length) return

  uploading.value = true
  try {
    for (const file of files) {
      await uploadAsset(file)
    }
    toast.add({
      title: files.length === 1 ? 'Image uploaded' : `${files.length} images uploaded`,
      color: 'success',
    })
    await refresh()
  }
  catch (error) {
    toast.add({ title: 'Failed to upload', color: 'error' })
    console.error(error)
  }
  finally {
    uploading.value = false
    input.value = '' // Reset for next upload
  }
}

// ─── Delete ──────────────────────────────────────────────────────────────────

const deleteModalOpen = ref(false)
const deletingAsset = ref<{ id: string; name: string } | null>(null)
const deleting = ref(false)

function confirmDelete(asset: { id: string; name: string }) {
  deletingAsset.value = asset
  deleteModalOpen.value = true
}

async function handleDelete() {
  if (!deletingAsset.value) return
  deleting.value = true
  try {
    await deleteAsset(deletingAsset.value.id)
    toast.add({ title: 'Asset deleted', color: 'success' })
    deleteModalOpen.value = false
    await refresh()
  }
  catch (error) {
    toast.add({ title: 'Failed to delete', color: 'error' })
    console.error(error)
  }
  finally {
    deleting.value = false
  }
}
</script>

<template>
  <div>
    <!-- Header -->
    <div class="flex items-center justify-between mb-6">
      <p class="text-muted">
        Upload images or generate them with AI.
      </p>
      <div class="flex items-center gap-2">
        <UButton
          icon="i-lucide-upload"
          variant="soft"
          color="neutral"
          :loading="uploading"
          @click="openFileDialog"
        >
          Upload
        </UButton>
        <UButton
          icon="i-lucide-sparkles"
          :loading="creating"
          @click="handleCreateImage"
        >
          Create Image
        </UButton>
      </div>
    </div>

    <!-- Hidden file input -->
    <input
      ref="fileInputRef"
      type="file"
      accept="image/*"
      multiple
      class="hidden"
      @change="handleFileSelect"
    >

    <!-- Empty state -->
    <EmptyState
      v-if="!pending && !assets?.length"
      icon="i-lucide-image"
      title="No assets yet"
      description="Upload images or create them with AI."
    >
      <div class="flex items-center gap-2">
        <UButton
          icon="i-lucide-upload"
          variant="soft"
          color="neutral"
          @click="openFileDialog"
        >
          Upload
        </UButton>
        <UButton
          icon="i-lucide-sparkles"
          @click="handleCreateImage"
        >
          Create Image
        </UButton>
      </div>
    </EmptyState>

    <!-- Asset grid -->
    <div v-else class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
      <div v-for="asset in assets" :key="asset.id" class="relative group">
        <AssetCard :asset="asset" />
        <!-- Delete button overlay -->
        <UButton
          icon="i-lucide-trash-2"
          variant="soft"
          color="error"
          size="xs"
          class="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity"
          @click.prevent="confirmDelete(asset)"
        />
      </div>
    </div>

    <!-- Delete confirmation -->
    <ConfirmModal
      v-model:open="deleteModalOpen"
      title="Delete Asset"
      :description="`Delete '${deletingAsset?.name}'? This cannot be undone.`"
      confirm-label="Delete"
      confirm-color="error"
      :loading="deleting"
      @confirm="handleDelete"
    />
  </div>
</template>
