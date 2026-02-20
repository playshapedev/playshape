import type { FileUIPart } from 'ai'

export interface PendingAttachment {
  /** Temporary client-side ID */
  id: string
  /** The file object */
  file: File
  /** Object URL for preview (must be revoked when done) */
  previewUrl: string
}

export interface UploadedAttachment {
  id: string
  url: string
  mediaType: string
  width: number
  height: number
  filename?: string
}

const SUPPORTED_TYPES = [
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/gif',
  'image/webp',
  'image/avif',
  'image/tiff',
  'image/svg+xml',
]

const MAX_FILE_SIZE = 10 * 1024 * 1024 // 10MB

/**
 * Composable for handling chat image attachments.
 * Supports paste, file selection, preview, and upload.
 */
export function useChatAttachments() {
  const pendingAttachments = ref<PendingAttachment[]>([])
  const isUploading = ref(false)
  const uploadError = ref<string | null>(null)

  /**
   * Check if a file is a valid image attachment.
   */
  function isValidImage(file: File): { valid: boolean; error?: string } {
    if (!SUPPORTED_TYPES.includes(file.type)) {
      return {
        valid: false,
        error: `Unsupported image type: ${file.type}. Supported: JPEG, PNG, GIF, WebP.`,
      }
    }
    if (file.size > MAX_FILE_SIZE) {
      return {
        valid: false,
        error: `Image too large: ${(file.size / 1024 / 1024).toFixed(1)}MB. Maximum: 10MB.`,
      }
    }
    return { valid: true }
  }

  /**
   * Add files to the pending attachments list.
   * Validates each file and creates preview URLs.
   */
  function addFiles(files: FileList | File[]) {
    uploadError.value = null
    const fileArray = Array.from(files)

    for (const file of fileArray) {
      const validation = isValidImage(file)
      if (!validation.valid) {
        uploadError.value = validation.error!
        continue
      }

      // Check for duplicates (same name and size)
      const isDuplicate = pendingAttachments.value.some(
        p => p.file.name === file.name && p.file.size === file.size,
      )
      if (isDuplicate) continue

      pendingAttachments.value.push({
        id: crypto.randomUUID(),
        file,
        previewUrl: URL.createObjectURL(file),
      })
    }
  }

  /**
   * Handle paste event. Returns true if an image was pasted.
   */
  function handlePaste(event: ClipboardEvent): boolean {
    const items = event.clipboardData?.items
    if (!items) return false

    const imageFiles: File[] = []

    for (const item of items) {
      if (item.type.startsWith('image/')) {
        const file = item.getAsFile()
        if (file) {
          imageFiles.push(file)
        }
      }
    }

    if (imageFiles.length > 0) {
      event.preventDefault()
      addFiles(imageFiles)
      return true
    }

    return false
  }

  /**
   * Remove a pending attachment by ID.
   */
  function removeAttachment(id: string) {
    const index = pendingAttachments.value.findIndex(p => p.id === id)
    if (index !== -1) {
      const attachment = pendingAttachments.value[index]!
      URL.revokeObjectURL(attachment.previewUrl)
      pendingAttachments.value.splice(index, 1)
    }
  }

  /**
   * Clear all pending attachments.
   */
  function clearPending() {
    for (const attachment of pendingAttachments.value) {
      URL.revokeObjectURL(attachment.previewUrl)
    }
    pendingAttachments.value = []
    uploadError.value = null
  }

  /**
   * Upload all pending attachments and return FileUIParts for the chat.
   * Files are processed server-side (resized, converted to WebP).
   */
  async function uploadAttachments(opts: {
    assetId?: string
    templateId?: string
    messageId: string
  }): Promise<FileUIPart[]> {
    if (pendingAttachments.value.length === 0) {
      return []
    }

    isUploading.value = true
    uploadError.value = null

    const results: FileUIPart[] = []

    try {
      for (const pending of pendingAttachments.value) {
        const formData = new FormData()
        formData.append('file', pending.file)
        formData.append('messageId', opts.messageId)

        if (opts.assetId) {
          formData.append('assetId', opts.assetId)
        }
        if (opts.templateId) {
          formData.append('templateId', opts.templateId)
        }

        const response = await $fetch<UploadedAttachment>('/api/attachments', {
          method: 'POST',
          body: formData,
        })

        results.push({
          type: 'file',
          mediaType: response.mediaType,
          url: response.url,
          filename: response.filename,
        })
      }

      // Clear pending after successful upload
      clearPending()

      return results
    }
    catch (error) {
      uploadError.value = error instanceof Error ? error.message : 'Upload failed'
      throw error
    }
    finally {
      isUploading.value = false
    }
  }

  /**
   * Check if there are any pending attachments.
   */
  const hasPending = computed(() => pendingAttachments.value.length > 0)

  // Cleanup on unmount
  onUnmounted(() => {
    clearPending()
  })

  return {
    pendingAttachments,
    isUploading,
    uploadError,
    hasPending,
    addFiles,
    handlePaste,
    removeAttachment,
    clearPending,
    uploadAttachments,
  }
}
