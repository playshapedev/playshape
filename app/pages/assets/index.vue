<script setup lang="ts">
const router = useRouter()
const toast = useToast()

const { assets, pending, refresh } = useAssets()

// Background task integration for video uploads and image generation
const { addTask, startTask, updateTask, completeTask, failTask, getTask } = useBackgroundTasks()

// ─── Generate Image ──────────────────────────────────────────────────────────

const generateModalOpen = ref(false)
const generatePrompt = ref('')
const generateName = ref('')
const isGenerating = ref(false)
const generatingTaskId = ref<string | null>(null)

// Watch for generation task completion
watch(() => generatingTaskId.value ? getTask(generatingTaskId.value) : null, (task) => {
  if (!task) return

  if (task.status === 'completed' && task.result) {
    const result = task.result as { assetId: string }
    isGenerating.value = false
    generatingTaskId.value = null
    generateModalOpen.value = false
    generatePrompt.value = ''
    generateName.value = ''
    // Navigate to the new asset
    router.push(`/assets/${result.assetId}`)
  }
  else if (task.status === 'failed') {
    isGenerating.value = false
    generatingTaskId.value = null
    toast.add({ title: 'Generation failed', description: task.error, color: 'error' })
  }
}, { deep: true })

function handleGenerateImage() {
  if (!generatePrompt.value.trim()) return

  isGenerating.value = true
  generatingTaskId.value = generateImageInBackground({
    prompt: generatePrompt.value.trim(),
    name: generateName.value.trim() || undefined,
  })
}

// ─── Image Upload ────────────────────────────────────────────────────────────

const imageInputRef = ref<HTMLInputElement | null>(null)
const uploadingImages = ref(false)

function openImageDialog() {
  imageInputRef.value?.click()
}

async function handleImageSelect(event: Event) {
  const input = event.target as HTMLInputElement
  const files = input.files
  if (!files?.length) return

  uploadingImages.value = true
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
    uploadingImages.value = false
    input.value = ''
  }
}

// ─── Video Upload ────────────────────────────────────────────────────────────

const videoInputRef = ref<HTMLInputElement | null>(null)

function openVideoDialog() {
  videoInputRef.value?.click()
}

async function handleVideoSelect(event: Event) {
  const input = event.target as HTMLInputElement
  const files = input.files
  if (!files?.length) return

  // Process each video file
  for (const file of files) {
    // Validate file type
    const allowedTypes = ['video/mp4', 'video/webm', 'video/quicktime', 'video/x-msvideo', 'video/x-matroska']
    if (!allowedTypes.includes(file.type)) {
      toast.add({
        title: 'Unsupported format',
        description: `${file.name} is not a supported video format`,
        color: 'error',
      })
      continue
    }

    // Create background task for this upload
    const taskId = addTask({
      type: 'video-upload',
      title: `Uploading ${file.name}`,
      description: 'Processing video...',
    })
    startTask(taskId)

    // Process in background (don't await)
    processVideoUpload(file, taskId)
  }

  input.value = ''
}

async function processVideoUpload(file: File, taskId: string) {
  try {
    // Create video asset
    const asset = await createVideoAsset({ name: file.name.replace(/\.[^/.]+$/, '') })
    updateTask(taskId, { progress: 10, description: 'Uploading video file...' })

    // Upload video to asset
    const formData = new FormData()
    formData.append('file', file)

    const videoResponse = await $fetch<{ id: string }>(`/api/assets/${asset.id}/videos`, {
      method: 'POST',
      body: formData,
    })

    updateTask(taskId, { progress: 90, description: 'Finalizing...' })

    completeTask(taskId, {
      assetId: asset.id,
      videoId: videoResponse.id,
    })

    // Refresh assets list
    await refresh()
  }
  catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Upload failed'
    failTask(taskId, errorMessage)
  }
}

// ─── Video URL ───────────────────────────────────────────────────────────────

const videoUrlModalOpen = ref(false)
const videoUrl = ref('')
const videoUrlError = ref('')
const addingVideoUrl = ref(false)

async function handleAddVideoUrl() {
  if (!videoUrl.value.trim()) return

  videoUrlError.value = ''
  addingVideoUrl.value = true

  try {
    await createVideoFromUrl(videoUrl.value.trim())
    toast.add({ title: 'Video added', color: 'success' })
    videoUrlModalOpen.value = false
    videoUrl.value = ''
    await refresh()
  }
  catch (error: unknown) {
    const err = error as { data?: { statusMessage?: string }, message?: string }
    videoUrlError.value = err.data?.statusMessage || err.message || 'Invalid video URL'
  }
  finally {
    addingVideoUrl.value = false
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
        Upload images and videos, or generate images with AI.
      </p>
      <div class="flex items-center gap-2">
        <!-- Upload dropdown -->
        <UDropdownMenu
          :items="[
            [
              { label: 'Upload Images', icon: 'i-lucide-image', onSelect: openImageDialog },
              { label: 'Upload Videos', icon: 'i-lucide-video', onSelect: openVideoDialog },
              { label: 'Add YouTube/Vimeo', icon: 'i-lucide-link', onSelect: () => videoUrlModalOpen = true },
            ],
          ]"
        >
          <UButton
            icon="i-lucide-upload"
            variant="soft"
            color="neutral"
            trailing-icon="i-lucide-chevron-down"
            :loading="uploadingImages"
          >
            Upload
          </UButton>
        </UDropdownMenu>
        <UButton
          icon="i-lucide-sparkles"
          @click="generateModalOpen = true"
        >
          Generate Image
        </UButton>
      </div>
    </div>

    <!-- Hidden file inputs -->
    <input
      ref="imageInputRef"
      type="file"
      accept="image/*"
      multiple
      class="hidden"
      @change="handleImageSelect"
    >
    <input
      ref="videoInputRef"
      type="file"
      accept="video/mp4,video/webm,video/quicktime,video/x-msvideo,video/x-matroska"
      multiple
      class="hidden"
      @change="handleVideoSelect"
    >

    <!-- Empty state -->
    <EmptyState
      v-if="!pending && !assets?.length"
      icon="i-lucide-image"
      title="No assets yet"
      description="Upload images and videos, or create images with AI."
    >
      <div class="flex items-center gap-2">
        <UDropdownMenu
          :items="[
            [
              { label: 'Upload Images', icon: 'i-lucide-image', onSelect: openImageDialog },
              { label: 'Upload Videos', icon: 'i-lucide-video', onSelect: openVideoDialog },
              { label: 'Add YouTube/Vimeo', icon: 'i-lucide-link', onSelect: () => videoUrlModalOpen = true },
            ],
          ]"
        >
          <UButton
            icon="i-lucide-upload"
            variant="soft"
            color="neutral"
            trailing-icon="i-lucide-chevron-down"
          >
            Upload
          </UButton>
        </UDropdownMenu>
        <UButton
          icon="i-lucide-sparkles"
          @click="generateModalOpen = true"
        >
          Generate Image
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

    <!-- Video URL Modal -->
    <UModal v-model:open="videoUrlModalOpen">
      <template #content>
        <UCard>
          <template #header>
            <div class="flex items-center justify-between">
              <h3 class="text-lg font-semibold text-highlighted">Add Video from URL</h3>
              <UButton
                icon="i-lucide-x"
                variant="ghost"
                color="neutral"
                size="sm"
                @click="videoUrlModalOpen = false"
              />
            </div>
          </template>

          <div class="space-y-4">
            <UFormField label="Video URL">
              <UInput
                v-model="videoUrl"
                placeholder="https://www.youtube.com/watch?v=... or https://vimeo.com/..."
                :disabled="addingVideoUrl"
                @keyup.enter="handleAddVideoUrl"
              />
            </UFormField>
            <p v-if="videoUrlError" class="text-sm text-error flex items-center gap-1.5">
              <UIcon name="i-lucide-alert-circle" class="size-4" />
              {{ videoUrlError }}
            </p>
            <p class="text-xs text-dimmed">
              Paste a YouTube or Vimeo video URL to add it to your assets.
            </p>
          </div>

          <template #footer>
            <div class="flex justify-end gap-2">
              <UButton
                variant="ghost"
                color="neutral"
                @click="videoUrlModalOpen = false"
              >
                Cancel
              </UButton>
              <UButton
                :loading="addingVideoUrl"
                :disabled="!videoUrl.trim()"
                @click="handleAddVideoUrl"
              >
                Add Video
              </UButton>
            </div>
          </template>
        </UCard>
      </template>
    </UModal>

    <!-- Generate Image Modal -->
    <UModal v-model:open="generateModalOpen">
      <template #content>
        <UCard>
          <template #header>
            <div class="flex items-center justify-between">
              <h3 class="text-lg font-semibold text-highlighted">Generate Image</h3>
              <UButton
                icon="i-lucide-x"
                variant="ghost"
                color="neutral"
                size="sm"
                :disabled="isGenerating"
                @click="generateModalOpen = false"
              />
            </div>
          </template>

          <div class="space-y-4">
            <UFormField label="Prompt" required>
              <UTextarea
                v-model="generatePrompt"
                placeholder="Describe the image you want to generate..."
                :rows="4"
                :disabled="isGenerating"
                autofocus
              />
            </UFormField>
            <UFormField label="Name" hint="Optional">
              <UInput
                v-model="generateName"
                placeholder="Give your image a name"
                :disabled="isGenerating"
              />
            </UFormField>
            <p v-if="isGenerating" class="text-sm text-muted flex items-center gap-2">
              <UIcon name="i-lucide-loader-circle" class="size-4 animate-spin" />
              Generating image in background...
            </p>
          </div>

          <template #footer>
            <div class="flex justify-end gap-2">
              <UButton
                variant="ghost"
                color="neutral"
                :disabled="isGenerating"
                @click="generateModalOpen = false"
              >
                Cancel
              </UButton>
              <UButton
                icon="i-lucide-sparkles"
                :loading="isGenerating"
                :disabled="!generatePrompt.trim() || isGenerating"
                @click="handleGenerateImage"
              >
                Generate
              </UButton>
            </div>
          </template>
        </UCard>
      </template>
    </UModal>

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
