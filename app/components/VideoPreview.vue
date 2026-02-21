<script setup lang="ts">
import type { VideoFieldValue } from '~~/server/database/schema'

const props = defineProps<{
  value: VideoFieldValue
  /** Whether to autoplay (muted) */
  autoplay?: boolean
}>()

// Determine if this is an embedded video (YouTube/Vimeo) or uploaded
const isEmbed = computed(() => props.value.source === 'youtube' || props.value.source === 'vimeo')

// Get the video URL
const videoUrl = computed(() => {
  if (isEmbed.value) {
    return props.value.url
  }
  // For uploads, construct the file URL
  if (props.value.assetId && props.value.videoId) {
    return `/api/assets/${props.value.assetId}/videos/${props.value.videoId}/file`
  }
  return null
})

// Get thumbnail URL for uploads
const thumbnailUrl = computed(() => {
  if (!isEmbed.value && props.value.assetId && props.value.videoId) {
    return `/api/assets/${props.value.assetId}/videos/${props.value.videoId}/thumbnail`
  }
  return null
})
</script>

<template>
  <div class="aspect-video w-full rounded-lg overflow-hidden bg-black">
    <!-- YouTube/Vimeo embed -->
    <iframe
      v-if="isEmbed && videoUrl"
      :src="videoUrl"
      class="w-full h-full"
      frameborder="0"
      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
      allowfullscreen
    />

    <!-- Uploaded video -->
    <video
      v-else-if="videoUrl"
      :src="videoUrl"
      :poster="thumbnailUrl || undefined"
      :autoplay="autoplay"
      :muted="autoplay"
      controls
      class="w-full h-full object-contain"
    />

    <!-- Fallback -->
    <div v-else class="w-full h-full flex items-center justify-center">
      <UIcon name="i-lucide-video-off" class="size-12 text-muted" />
    </div>
  </div>
</template>
