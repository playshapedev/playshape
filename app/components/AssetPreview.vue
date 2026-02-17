<script setup lang="ts">
import type { AssetWithImages, AssetImage } from '~/composables/useAssets'

const props = defineProps<{
  asset: AssetWithImages | null
}>()

// Currently selected image (defaults to the most recent one)
const selectedImageId = ref<string | null>(null)

// When asset changes, select the most recent image
watch(() => props.asset?.images, (images) => {
  if (images?.length && !selectedImageId.value) {
    selectedImageId.value = images[0]!.id
  }
}, { immediate: true })

// When new images are added, auto-select the newest
watch(() => props.asset?.images?.length, (newLen, oldLen) => {
  if (newLen && oldLen !== undefined && newLen > oldLen && props.asset?.images?.length) {
    selectedImageId.value = props.asset.images[0]!.id
  }
})

const selectedImage = computed(() => {
  if (!props.asset?.images?.length || !selectedImageId.value) return null
  return props.asset.images.find(img => img.id === selectedImageId.value) || props.asset.images[0]
})

const selectedImageUrl = computed(() => {
  if (!selectedImage.value || !props.asset) return null
  return getAssetImageUrl(props.asset.id, selectedImage.value.id)
})

function formatFileSize(bytes: number | null | undefined) {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function downloadImage() {
  if (!selectedImageUrl.value || !selectedImage.value || !props.asset) return
  const link = document.createElement('a')
  link.href = selectedImageUrl.value
  const ext = selectedImage.value.mimeType?.split('/')[1] || 'png'
  link.download = `${props.asset.name}-${selectedImage.value.id.slice(0, 8)}.${ext}`
  link.click()
}

function selectImage(image: AssetImage) {
  selectedImageId.value = image.id
}

function getThumbnailUrl(image: AssetImage) {
  if (!props.asset) return ''
  return getAssetImageUrl(props.asset.id, image.id)
}
</script>

<template>
  <div class="h-full flex flex-col bg-elevated/50">
    <!-- Image history thumbnails -->
    <div v-if="asset?.images?.length && asset.images.length > 1" class="border-b border-default p-2 overflow-x-auto">
      <div class="flex gap-2">
        <button
          v-for="image in asset.images"
          :key="image.id"
          class="shrink-0 w-14 h-14 rounded-md overflow-hidden border-2 transition-all hover:opacity-90"
          :class="selectedImageId === image.id ? 'border-primary ring-2 ring-primary/20' : 'border-transparent opacity-70'"
          @click="selectImage(image)"
        >
          <img
            :src="getThumbnailUrl(image)"
            :alt="image.prompt || 'Generated image'"
            class="w-full h-full object-cover"
          >
        </button>
      </div>
    </div>

    <!-- Main image display -->
    <div class="flex-1 flex items-center justify-center p-4 overflow-hidden">
      <template v-if="selectedImageUrl">
        <img
          :src="selectedImageUrl"
          :alt="selectedImage?.prompt || asset?.name || 'Generated image'"
          class="max-w-full max-h-full object-contain rounded-lg shadow-lg"
        >
      </template>
      <template v-else>
        <div class="text-center">
          <UIcon name="i-lucide-image" class="size-16 text-muted mb-4" />
          <p class="text-muted">No image yet</p>
          <p class="text-sm text-dimmed mt-1">Chat with the AI to generate an image</p>
        </div>
      </template>
    </div>

    <!-- Info bar -->
    <div v-if="selectedImage" class="border-t border-default p-3 flex items-center justify-between">
      <div class="text-sm text-muted">
        <span v-if="selectedImage.width && selectedImage.height">{{ selectedImage.width }} x {{ selectedImage.height }}</span>
        <span v-if="selectedImage.width && selectedImage.height && selectedImage.fileSize" class="mx-2">·</span>
        <span v-if="selectedImage.fileSize">{{ formatFileSize(selectedImage.fileSize) }}</span>
        <span v-if="asset && asset.images && asset.images.length > 1" class="ml-2 text-dimmed">
          ({{ asset.images.findIndex((i: AssetImage) => i.id === selectedImage?.id) + 1 }} of {{ asset.images.length }})
        </span>
      </div>
      <UButton
        icon="i-lucide-download"
        variant="ghost"
        color="neutral"
        size="sm"
        @click="downloadImage"
      >
        Download
      </UButton>
    </div>
  </div>
</template>
