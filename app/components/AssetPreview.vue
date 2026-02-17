<script setup lang="ts">
import type { Asset } from '~/composables/useAssets'

const props = defineProps<{
  asset: Asset | null
}>()

const imageUrl = computed(() => {
  if (!props.asset?.storagePath) return null
  return getAssetFileUrl(props.asset.id)
})

// Add cache-busting query param when asset updates
const imageSrc = computed(() => {
  if (!imageUrl.value || !props.asset) return null
  return `${imageUrl.value}?t=${new Date(props.asset.updatedAt).getTime()}`
})

function formatFileSize(bytes: number | null) {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function downloadImage() {
  if (!imageSrc.value || !props.asset) return
  const link = document.createElement('a')
  link.href = imageSrc.value
  link.download = `${props.asset.name}.${props.asset.mimeType?.split('/')[1] || 'png'}`
  link.click()
}
</script>

<template>
  <div class="h-full flex flex-col bg-elevated/50">
    <!-- Image display -->
    <div class="flex-1 flex items-center justify-center p-4 overflow-hidden">
      <template v-if="imageSrc">
        <img
          :src="imageSrc"
          :alt="asset?.name || 'Generated image'"
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
    <div v-if="asset?.storagePath" class="border-t border-default p-3 flex items-center justify-between">
      <div class="text-sm text-muted">
        <span v-if="asset.width && asset.height">{{ asset.width }} x {{ asset.height }}</span>
        <span v-if="asset.width && asset.height && asset.fileSize" class="mx-2">-</span>
        <span v-if="asset.fileSize">{{ formatFileSize(asset.fileSize) }}</span>
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
