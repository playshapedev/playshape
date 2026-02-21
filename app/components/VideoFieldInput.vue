<script setup lang="ts">
import type { VideoFieldValue } from '~~/server/database/schema'

const props = defineProps<{
  modelValue?: VideoFieldValue | null
  projectId?: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: VideoFieldValue | null]
}>()

// UI State
const activeTab = ref<'url' | 'upload'>('url')
const videoUrl = ref('')
const urlError = ref('')
const isProcessingUrl = ref(false)
const isUploading = ref(false)
const uploadProgress = ref(0)

// Background tasks integration for video processing
const { addTask, startTask, updateTask, completeTask, failTask, getTask } = useBackgroundTasks()
const uploadTaskId = ref<string | null>(null)

// Watch for upload task completion
watch(() => uploadTaskId.value ? getTask(uploadTaskId.value) : null, (task) => {
  if (!task) return

  if (task.status === 'completed' && task.result) {
    const result = task.result as { assetId: string, videoId: string }
    emit('update:modelValue', {
      source: 'upload',
      url: `/api/assets/${result.assetId}/videos/${result.videoId}/file`,
      assetId: result.assetId,
      videoId: result.videoId,
    })
    isUploading.value = false
    uploadTaskId.value = null
  }
  else if (task.status === 'failed') {
    isUploading.value = false
    uploadTaskId.value = null
  }
}, { deep: true })

// Handle YouTube/Vimeo URL submission
async function submitUrl() {
  if (!videoUrl.value.trim()) return

  urlError.value = ''
  isProcessingUrl.value = true

  try {
    const response = await $fetch('/api/assets/videos/url', {
      method: 'POST',
      body: {
        url: videoUrl.value.trim(),
        projectId: props.projectId,
      },
    })

    emit('update:modelValue', {
      source: response.video.source as 'youtube' | 'vimeo',
      url: response.video.url,
    })

    videoUrl.value = ''
  }
  catch (error: unknown) {
    const err = error as { data?: { statusMessage?: string }, message?: string }
    urlError.value = err.data?.statusMessage || err.message || 'Invalid video URL'
  }
  finally {
    isProcessingUrl.value = false
  }
}

// Handle video file upload
async function onFileSelect(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return

  // Validate file type
  const allowedTypes = ['video/mp4', 'video/webm', 'video/quicktime', 'video/x-msvideo', 'video/x-matroska']
  if (!allowedTypes.includes(file.type)) {
    urlError.value = 'Unsupported video format. Use MP4, WebM, MOV, AVI, or MKV.'
    input.value = ''
    return
  }

  urlError.value = ''
  isUploading.value = true
  uploadProgress.value = 0

  // Create background task
  const taskId = addTask({
    type: 'video-upload',
    title: `Uploading ${file.name}`,
    description: 'Processing video...',
  })
  uploadTaskId.value = taskId
  startTask(taskId)

  try {
    // First create a video asset
    const asset = await $fetch('/api/assets', {
      method: 'POST',
      body: {
        name: file.name.replace(/\.[^/.]+$/, ''), // Remove extension
        type: 'video',
        projectId: props.projectId,
      },
    })

    updateTask(taskId, { progress: 10, description: 'Uploading video file...' })

    // Upload the video file
    const formData = new FormData()
    formData.append('file', file)

    const videoResponse = await $fetch(`/api/assets/${asset.id}/videos`, {
      method: 'POST',
      body: formData,
    })

    updateTask(taskId, { progress: 90, description: 'Finalizing...' })

    completeTask(taskId, {
      assetId: asset.id,
      videoId: videoResponse.id,
    })
  }
  catch (error: unknown) {
    const err = error as { data?: { statusMessage?: string }, message?: string }
    const errorMessage = err.data?.statusMessage || err.message || 'Upload failed'
    failTask(taskId, errorMessage)
    urlError.value = errorMessage
  }
  finally {
    input.value = ''
  }
}

// Clear the current video
function clearVideo() {
  emit('update:modelValue', null)
}

// Get display info for current value
const currentVideoInfo = computed(() => {
  if (!props.modelValue) return null

  if (props.modelValue.source === 'youtube') {
    return { label: 'YouTube Video', icon: 'i-lucide-youtube' }
  }
  if (props.modelValue.source === 'vimeo') {
    return { label: 'Vimeo Video', icon: 'i-lucide-video' }
  }
  return { label: 'Uploaded Video', icon: 'i-lucide-hard-drive' }
})
</script>

<template>
  <div class="space-y-3">
    <!-- Current video preview -->
    <div v-if="modelValue" class="space-y-2">
      <VideoPreview :value="modelValue" />

      <div class="flex items-center justify-between">
        <div class="flex items-center gap-2 text-sm text-muted">
          <UIcon v-if="currentVideoInfo" :name="currentVideoInfo.icon" class="size-4" />
          <span>{{ currentVideoInfo?.label }}</span>
        </div>
        <UButton
          icon="i-lucide-x"
          label="Remove"
          size="xs"
          color="error"
          variant="ghost"
          @click="clearVideo"
        />
      </div>
    </div>

    <!-- Input options -->
    <div v-else class="space-y-3">
      <!-- Tab switcher -->
      <div class="flex gap-1 p-1 bg-elevated rounded-lg">
        <button
          type="button"
          class="flex-1 px-3 py-1.5 text-sm font-medium rounded-md transition-colors"
          :class="activeTab === 'url' ? 'bg-default text-highlighted shadow-sm' : 'text-muted hover:text-default'"
          @click="activeTab = 'url'"
        >
          <UIcon name="i-lucide-link" class="size-4 mr-1.5 inline-block" />
          YouTube / Vimeo
        </button>
        <button
          type="button"
          class="flex-1 px-3 py-1.5 text-sm font-medium rounded-md transition-colors"
          :class="activeTab === 'upload' ? 'bg-default text-highlighted shadow-sm' : 'text-muted hover:text-default'"
          @click="activeTab = 'upload'"
        >
          <UIcon name="i-lucide-upload" class="size-4 mr-1.5 inline-block" />
          Upload
        </button>
      </div>

      <!-- URL input -->
      <div v-if="activeTab === 'url'" class="space-y-2">
        <div class="flex gap-2">
          <UInput
            v-model="videoUrl"
            placeholder="Paste YouTube or Vimeo URL..."
            class="flex-1"
            :disabled="isProcessingUrl"
            @keyup.enter="submitUrl"
          />
          <UButton
            icon="i-lucide-check"
            :loading="isProcessingUrl"
            :disabled="!videoUrl.trim() || isProcessingUrl"
            @click="submitUrl"
          />
        </div>
        <p class="text-xs text-dimmed">
          Supports YouTube and Vimeo video URLs
        </p>
      </div>

      <!-- Upload input -->
      <div v-if="activeTab === 'upload'" class="space-y-2">
        <div
          class="border-2 border-dashed border-default rounded-lg p-6 text-center hover:border-primary/50 transition-colors cursor-pointer"
          @click="$refs.fileInput?.click()"
        >
          <template v-if="isUploading">
            <UIcon name="i-lucide-loader-circle" class="size-8 text-primary mx-auto mb-2 animate-spin" />
            <p class="text-sm text-muted">Processing video...</p>
            <p class="text-xs text-dimmed mt-1">This may take a moment</p>
          </template>
          <template v-else>
            <UIcon name="i-lucide-upload" class="size-8 text-muted mx-auto mb-2" />
            <p class="text-sm text-muted">Click to upload a video</p>
            <p class="text-xs text-dimmed mt-1">MP4, WebM, MOV, AVI, MKV</p>
          </template>
        </div>

        <!-- Hidden file input -->
        <input
          ref="fileInput"
          type="file"
          accept="video/mp4,video/webm,video/quicktime,video/x-msvideo,video/x-matroska"
          class="hidden"
          :disabled="isUploading"
          @change="onFileSelect"
        >
      </div>

      <!-- Error message -->
      <p v-if="urlError" class="text-sm text-error flex items-center gap-1.5">
        <UIcon name="i-lucide-alert-circle" class="size-4" />
        {{ urlError }}
      </p>
    </div>
  </div>
</template>
