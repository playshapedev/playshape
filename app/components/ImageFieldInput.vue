<script setup lang="ts">
import type { ImageFieldValue } from '~~/server/database/schema'

const props = defineProps<{
  modelValue?: ImageFieldValue | null
  projectId?: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: ImageFieldValue | null]
}>()

// UI State
const showBrowser = ref(false)
const showGeneratePrompt = ref(false)
const generatePrompt = ref('')
const isGenerating = ref(false)

// Computed image URL from value
const imageUrl = computed(() => {
  if (!props.modelValue?.assetId || !props.modelValue?.imageId) return null
  return getAssetImageUrl(props.modelValue.assetId, props.modelValue.imageId)
})

// Background tasks integration
const { getTask } = useBackgroundTasks()
const generatingTaskId = ref<string | null>(null)

// Watch for task completion
watch(() => generatingTaskId.value ? getTask(generatingTaskId.value) : null, (task) => {
  if (!task) return

  if (task.status === 'completed' && task.result) {
    const result = task.result as { assetId: string, imageId: string, url: string }
    emit('update:modelValue', {
      assetId: result.assetId,
      imageId: result.imageId,
    })
    isGenerating.value = false
    generatingTaskId.value = null
    showGeneratePrompt.value = false
    generatePrompt.value = ''
  }
  else if (task.status === 'failed') {
    isGenerating.value = false
    generatingTaskId.value = null
  }
}, { deep: true })

// Handle asset browser selection
function onAssetSelect(selection: { assetId: string, imageId: string, url: string }) {
  emit('update:modelValue', {
    assetId: selection.assetId,
    imageId: selection.imageId,
  })
}

// Handle image generation
function startGeneration() {
  if (!generatePrompt.value.trim()) return

  isGenerating.value = true
  generatingTaskId.value = generateImageInBackground({
    prompt: generatePrompt.value.trim(),
    projectId: props.projectId,
  })
}

// Clear the current image
function clearImage() {
  emit('update:modelValue', null)
}

// Handle file upload
async function onFileSelect(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return

  // Validate file type
  if (!file.type.startsWith('image/')) {
    console.error('Invalid file type:', file.type)
    return
  }

  try {
    // Upload the file as a new asset
    const asset = await uploadAsset(file, props.projectId)

    // The uploaded asset should have one image
    const assetWithImages = await $fetch<{ images: Array<{ id: string }> }>(`/api/assets/${asset.id}`)
    if (assetWithImages.images?.[0]) {
      emit('update:modelValue', {
        assetId: asset.id,
        imageId: assetWithImages.images[0].id,
      })
    }
  }
  catch (error) {
    console.error('Failed to upload image:', error)
  }
  finally {
    // Reset the input
    input.value = ''
  }
}
</script>

<template>
  <div class="space-y-2">
    <!-- Current image preview -->
    <div v-if="imageUrl" class="relative group">
      <div class="aspect-video w-full max-w-xs rounded-lg overflow-hidden border border-default bg-elevated">
        <img
          :src="imageUrl"
          alt="Selected image"
          class="w-full h-full object-cover"
        >
      </div>
      <!-- Overlay actions -->
      <div class="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center gap-2 rounded-lg">
        <UButton
          icon="i-lucide-replace"
          label="Replace"
          size="sm"
          color="white"
          variant="solid"
          @click="showBrowser = true"
        />
        <UButton
          icon="i-lucide-x"
          label="Remove"
          size="sm"
          color="error"
          variant="solid"
          @click="clearImage"
        />
      </div>
    </div>

    <!-- Empty state / actions -->
    <div v-else class="flex flex-col gap-2">
      <!-- Action buttons -->
      <div class="flex flex-wrap gap-2">
        <UButton
          icon="i-lucide-image"
          label="Browse Assets"
          size="sm"
          variant="soft"
          color="neutral"
          @click="showBrowser = true"
        />
        <UButton
          icon="i-lucide-upload"
          label="Upload"
          size="sm"
          variant="soft"
          color="neutral"
          @click="$refs.fileInput?.click()"
        />
        <UButton
          icon="i-lucide-sparkles"
          label="Generate"
          size="sm"
          variant="soft"
          color="primary"
          @click="showGeneratePrompt = !showGeneratePrompt"
        />
      </div>

      <!-- Hidden file input -->
      <input
        ref="fileInput"
        type="file"
        accept="image/*"
        class="hidden"
        @change="onFileSelect"
      >

      <!-- Generate prompt input -->
      <div v-if="showGeneratePrompt" class="flex gap-2">
        <UInput
          v-model="generatePrompt"
          placeholder="Describe the image you want..."
          class="flex-1"
          :disabled="isGenerating"
          @keyup.enter="startGeneration"
        />
        <UButton
          icon="i-lucide-sparkles"
          :loading="isGenerating"
          :disabled="!generatePrompt.trim() || isGenerating"
          @click="startGeneration"
        />
      </div>

      <!-- Generating indicator -->
      <p v-if="isGenerating" class="text-xs text-muted flex items-center gap-1.5">
        <UIcon name="i-lucide-loader-circle" class="size-3 animate-spin" />
        Generating image in background...
      </p>
    </div>

    <!-- Asset browser modal -->
    <AssetBrowserModal
      v-model:open="showBrowser"
      asset-type="image"
      :project-id="projectId"
      @select="onAssetSelect"
    />
  </div>
</template>
