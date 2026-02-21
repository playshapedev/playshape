<script setup lang="ts">
import type { AssetWithMedia } from '~/composables/useAssets'

const props = defineProps<{
  asset: AssetWithMedia
}>()

const isVideo = computed(() => props.asset.type === 'video')

// Get the most recent image (first in the array since sorted by createdAt desc)
const latestImage = computed(() => props.asset.images?.[0] || null)

// Get the most recent video
const latestVideo = computed(() => props.asset.videos?.[0] || null)

const thumbnailUrl = computed(() => {
  if (isVideo.value && latestVideo.value) {
    // For YouTube/Vimeo, thumbnailPath is the external URL
    // For uploads, it's a relative path
    if (latestVideo.value.source === 'youtube' || latestVideo.value.source === 'vimeo') {
      return latestVideo.value.thumbnailPath
    }
    return getAssetVideoThumbnailUrl(props.asset.id, latestVideo.value.id)
  }
  if (latestImage.value) {
    return getAssetImageUrl(props.asset.id, latestImage.value.id)
  }
  return null
})

// Media count for badge
const mediaCount = computed(() => {
  if (isVideo.value) return props.asset.videoCount || 0
  return props.asset.imageCount || 0
})

// Media label
const mediaLabel = computed(() => {
  const count = mediaCount.value
  if (isVideo.value) {
    if (count === 0) return 'No videos'
    if (count === 1) return '1 video'
    return `${count} videos`
  }
  if (count === 0) return 'No images'
  if (count === 1) return '1 image'
  return `${count} images`
})

// Dimensions label
const dimensionsLabel = computed(() => {
  if (isVideo.value && latestVideo.value?.width && latestVideo.value.height) {
    return `${latestVideo.value.width} x ${latestVideo.value.height}`
  }
  if (latestImage.value?.width && latestImage.value.height) {
    return `${latestImage.value.width} x ${latestImage.value.height}`
  }
  return null
})

// Duration label for videos
const durationLabel = computed(() => {
  if (!isVideo.value || !latestVideo.value?.duration) return null
  const mins = Math.floor(latestVideo.value.duration / 60)
  const secs = latestVideo.value.duration % 60
  return `${mins}:${secs.toString().padStart(2, '0')}`
})
</script>

<template>
  <NuxtLink :to="`/assets/${asset.id}`" class="block">
    <UCard
      class="hover:ring-primary/50 hover:ring-2 transition-all cursor-pointer h-full overflow-hidden"
      :ui="{ body: 'p-0' }"
    >
      <!-- Thumbnail preview -->
      <div
        v-if="thumbnailUrl"
        class="aspect-square w-full overflow-hidden bg-elevated relative"
      >
        <img
          :src="thumbnailUrl"
          :alt="asset.name"
          class="w-full h-full object-cover"
        >
        <!-- Video play icon overlay -->
        <div
          v-if="isVideo"
          class="absolute inset-0 flex items-center justify-center"
        >
          <div class="size-12 rounded-full bg-black/60 flex items-center justify-center">
            <UIcon name="i-lucide-play" class="size-6 text-white ml-0.5" />
          </div>
        </div>
        <!-- Duration badge for videos -->
        <div
          v-if="isVideo && durationLabel"
          class="absolute bottom-2 left-2 px-1.5 py-0.5 rounded bg-black/70 text-white text-xs font-medium"
        >
          {{ durationLabel }}
        </div>
        <!-- Count badge -->
        <div
          v-if="mediaCount > 1"
          class="absolute bottom-2 right-2 px-2 py-0.5 rounded-full bg-black/60 text-white text-xs font-medium flex items-center gap-1"
        >
          <UIcon :name="isVideo ? 'i-lucide-video' : 'i-lucide-images'" class="size-3" />
          {{ mediaCount }}
        </div>
      </div>
      <!-- Placeholder when no media yet -->
      <div
        v-else
        class="aspect-square w-full flex items-center justify-center bg-elevated"
      >
        <UIcon :name="isVideo ? 'i-lucide-video' : 'i-lucide-image-plus'" class="size-8 text-dimmed" />
      </div>

      <!-- Card body -->
      <div class="p-3 space-y-1">
        <h3 class="font-medium text-highlighted truncate text-sm">
          {{ asset.name }}
        </h3>
        <div class="flex items-center gap-2 text-xs text-dimmed">
          <span v-if="dimensionsLabel">
            {{ dimensionsLabel }}
          </span>
          <span>{{ mediaLabel }}</span>
        </div>
      </div>
    </UCard>
  </NuxtLink>
</template>
