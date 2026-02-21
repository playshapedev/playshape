<script setup lang="ts">
import type { AssetWithMedia, AssetImage, AssetVideo } from '~/composables/useAssets'

const props = defineProps<{
  asset: AssetWithMedia | null
}>()

const isVideo = computed(() => props.asset?.type === 'video')

// ─── Image Selection ─────────────────────────────────────────────────────────

const selectedImageId = ref<string | null>(null)

watch(() => props.asset?.images, (images) => {
  if (images?.length && !selectedImageId.value) {
    selectedImageId.value = images[0]!.id
  }
}, { immediate: true })

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

function selectImage(image: AssetImage) {
  selectedImageId.value = image.id
}

function getImageThumbnailUrl(image: AssetImage) {
  if (!props.asset) return ''
  return getAssetImageUrl(props.asset.id, image.id)
}

// ─── Video Selection ─────────────────────────────────────────────────────────

const selectedVideoId = ref<string | null>(null)

watch(() => props.asset?.videos, (videos) => {
  if (videos?.length && !selectedVideoId.value) {
    selectedVideoId.value = videos[0]!.id
  }
}, { immediate: true })

watch(() => props.asset?.videos?.length, (newLen, oldLen) => {
  if (newLen && oldLen !== undefined && newLen > oldLen && props.asset?.videos?.length) {
    selectedVideoId.value = props.asset.videos[0]!.id
  }
})

const selectedVideo = computed(() => {
  if (!props.asset?.videos?.length || !selectedVideoId.value) return null
  return props.asset.videos.find(vid => vid.id === selectedVideoId.value) || props.asset.videos[0]
})

const selectedVideoUrl = computed(() => {
  if (!selectedVideo.value || !props.asset) return null
  if (selectedVideo.value.source === 'youtube' || selectedVideo.value.source === 'vimeo') {
    return selectedVideo.value.url
  }
  return getAssetVideoUrl(props.asset.id, selectedVideo.value.id)
})

const selectedVideoThumbnailUrl = computed(() => {
  if (!selectedVideo.value || !props.asset) return null
  if (selectedVideo.value.source === 'youtube' || selectedVideo.value.source === 'vimeo') {
    return selectedVideo.value.thumbnailPath
  }
  return getAssetVideoThumbnailUrl(props.asset.id, selectedVideo.value.id)
})

function selectVideo(video: AssetVideo) {
  selectedVideoId.value = video.id
}

function getVideoThumbnail(video: AssetVideo) {
  if (!props.asset) return ''
  if (video.source === 'youtube' || video.source === 'vimeo') {
    return video.thumbnailPath || ''
  }
  return getAssetVideoThumbnailUrl(props.asset.id, video.id)
}

// ─── Utilities ───────────────────────────────────────────────────────────────

function formatFileSize(bytes: number | null | undefined) {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function formatDuration(seconds: number | null | undefined) {
  if (!seconds) return ''
  const mins = Math.floor(seconds / 60)
  const secs = seconds % 60
  return `${mins}:${secs.toString().padStart(2, '0')}`
}

function downloadImage() {
  if (!selectedImageUrl.value || !selectedImage.value || !props.asset) return
  const link = document.createElement('a')
  link.href = selectedImageUrl.value
  const ext = selectedImage.value.mimeType?.split('/')[1] || 'png'
  link.download = `${props.asset.name}-${selectedImage.value.id.slice(0, 8)}.${ext}`
  link.click()
}

function downloadVideo() {
  if (!selectedVideo.value || !props.asset) return
  // Only allow download for uploaded videos
  if (selectedVideo.value.source !== 'upload') return
  const link = document.createElement('a')
  link.href = getAssetVideoUrl(props.asset.id, selectedVideo.value.id)
  link.download = `${props.asset.name}-${selectedVideo.value.id.slice(0, 8)}.mp4`
  link.click()
}
</script>

<template>
  <div class="h-full flex flex-col bg-elevated/50">
    <!-- Video asset preview -->
    <template v-if="isVideo">
      <!-- Video history thumbnails -->
      <div v-if="asset?.videos?.length && asset.videos.length > 1" class="border-b border-default p-2 overflow-x-auto">
        <div class="flex gap-2">
          <button
            v-for="video in asset.videos"
            :key="video.id"
            class="relative shrink-0 w-20 h-14 rounded-md overflow-hidden border-2 transition-all hover:opacity-90"
            :class="selectedVideoId === video.id ? 'border-primary ring-2 ring-primary/20' : 'border-transparent opacity-70'"
            @click="selectVideo(video)"
          >
            <img
              v-if="getVideoThumbnail(video)"
              :src="getVideoThumbnail(video)"
              alt="Video thumbnail"
              class="w-full h-full object-cover"
            >
            <div v-else class="w-full h-full bg-neutral-800 flex items-center justify-center">
              <UIcon name="i-lucide-video" class="size-4 text-neutral-400" />
            </div>
            <div class="absolute inset-0 flex items-center justify-center">
              <UIcon name="i-lucide-play" class="size-4 text-white drop-shadow" />
            </div>
          </button>
        </div>
      </div>

      <!-- Main video display -->
      <div class="flex-1 flex items-center justify-center p-4 overflow-hidden">
        <template v-if="selectedVideo">
          <!-- YouTube/Vimeo embed -->
          <iframe
            v-if="selectedVideo.source === 'youtube' || selectedVideo.source === 'vimeo'"
            :src="selectedVideoUrl || ''"
            class="w-full max-w-4xl aspect-video rounded-lg shadow-lg"
            frameborder="0"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowfullscreen
          />
          <!-- Uploaded video -->
          <video
            v-else
            :src="selectedVideoUrl || ''"
            :poster="selectedVideoThumbnailUrl || undefined"
            controls
            class="max-w-full max-h-full rounded-lg shadow-lg"
          />
        </template>
        <template v-else>
          <div class="text-center">
            <UIcon name="i-lucide-video" class="size-16 text-muted mb-4" />
            <p class="text-muted">No video yet</p>
            <p class="text-sm text-dimmed mt-1">Upload a video or add a YouTube/Vimeo link</p>
          </div>
        </template>
      </div>

      <!-- Video info bar -->
      <div v-if="selectedVideo" class="border-t border-default p-3 flex items-center justify-between">
        <div class="text-sm text-muted flex items-center gap-2">
          <UBadge
            :color="selectedVideo.source === 'youtube' ? 'error' : selectedVideo.source === 'vimeo' ? 'info' : 'neutral'"
            variant="subtle"
            size="xs"
          >
            {{ selectedVideo.source === 'youtube' ? 'YouTube' : selectedVideo.source === 'vimeo' ? 'Vimeo' : 'Upload' }}
          </UBadge>
          <span v-if="selectedVideo.width && selectedVideo.height">{{ selectedVideo.width }} x {{ selectedVideo.height }}</span>
          <span v-if="selectedVideo.duration">{{ formatDuration(selectedVideo.duration) }}</span>
          <span v-if="selectedVideo.fileSize">{{ formatFileSize(selectedVideo.fileSize) }}</span>
          <span v-if="asset && asset.videos && asset.videos.length > 1" class="text-dimmed">
            ({{ asset.videos.findIndex((v: AssetVideo) => v.id === selectedVideo?.id) + 1 }} of {{ asset.videos.length }})
          </span>
        </div>
        <UButton
          v-if="selectedVideo.source === 'upload'"
          icon="i-lucide-download"
          variant="ghost"
          color="neutral"
          size="sm"
          @click="downloadVideo"
        >
          Download
        </UButton>
      </div>
    </template>

    <!-- Image asset preview -->
    <template v-else>
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
              :src="getImageThumbnailUrl(image)"
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

      <!-- Image info bar -->
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
    </template>
  </div>
</template>
