<script setup lang="ts">
import type { UIMessage } from 'ai'

definePageMeta({ layout: 'dashboard', noPadding: true })

const route = useRoute()
const router = useRouter()
const toast = useToast()
const { setTitle } = useNavbar()

const libraryId = route.params.id as string
const documentId = route.params.docId as string

const { document: doc, pending, error, refresh } = useDocument(libraryId, documentId)

// Set dynamic navbar title from document title
watch(() => doc.value?.title, (title) => {
  if (title) setTitle(title)
}, { immediate: true })

// ─── Delete ──────────────────────────────────────────────────────────────────

const showDeleteModal = ref(false)
const deleting = ref(false)

async function handleDelete() {
  if (!doc.value) return
  deleting.value = true
  try {
    await deleteDocument(libraryId, documentId)
    toast.add({ title: 'Document deleted', color: 'success' })
    await router.push(`/libraries/${libraryId}`)
  }
  catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Unknown error'
    toast.add({ title: 'Failed to delete', description: message, color: 'error' })
  }
  finally {
    deleting.value = false
  }
}

// ─── Clear Chat ──────────────────────────────────────────────────────────────

const showClearChatModal = ref(false)
const clearing = ref(false)
const chatKey = ref(0)

async function handleClearChat() {
  if (!doc.value) return
  clearing.value = true
  try {
    await $fetch(`/api/libraries/${libraryId}/documents/${documentId}`, {
      method: 'PATCH',
      body: { messages: [], body: '', title: 'Untitled Document' },
    })
    showClearChatModal.value = false
    initialChatMessages.value = []
    chatKey.value++
    await refresh()
    toast.add({ title: 'Chat cleared', color: 'success' })
  }
  catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Unknown error'
    toast.add({ title: 'Failed to clear chat', description: message, color: 'error' })
  }
  finally {
    clearing.value = false
  }
}

// ─── Layout ──────────────────────────────────────────────────────────────────

// Capture initial messages once so the prop reference stays stable
const initialChatMessages = ref<UIMessage[]>([])
watch(() => doc.value?.messages, (messages) => {
  if (messages && !initialChatMessages.value.length) {
    initialChatMessages.value = messages as unknown as UIMessage[]
  }
}, { immediate: true })

const chatPosition = ref<'left' | 'right'>(
  (typeof localStorage !== 'undefined' && localStorage.getItem('playshape:docgen-chat-position') as 'left' | 'right') || 'left',
)

function toggleChatPosition() {
  chatPosition.value = chatPosition.value === 'left' ? 'right' : 'left'
  localStorage.setItem('playshape:docgen-chat-position', chatPosition.value)
}

// ─── Resizable Panels ────────────────────────────────────────────────────────

const STORAGE_KEY = 'playshape:docgen-chat-width'
const DEFAULT_CHAT_PCT = 35
const MIN_CHAT_PCT = 20
const MAX_CHAT_PCT = 60

const containerRef = ref<HTMLElement | null>(null)
const chatWidthPct = ref(
  parseFloat(typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) || '' : '') || DEFAULT_CHAT_PCT,
)

const isDragging = ref(false)

function onResizeStart(e: PointerEvent) {
  e.preventDefault()
  isDragging.value = true

  const container = containerRef.value
  if (!container) return

  const onMove = (ev: PointerEvent) => {
    const rect = container.getBoundingClientRect()
    let pct: number
    if (chatPosition.value === 'left') {
      pct = ((ev.clientX - rect.left) / rect.width) * 100
    }
    else {
      pct = ((rect.right - ev.clientX) / rect.width) * 100
    }
    chatWidthPct.value = Math.min(MAX_CHAT_PCT, Math.max(MIN_CHAT_PCT, pct))
  }

  const onUp = () => {
    isDragging.value = false
    localStorage.setItem(STORAGE_KEY, chatWidthPct.value.toFixed(1))
    document.removeEventListener('pointermove', onMove)
    document.removeEventListener('pointerup', onUp)
  }

  document.addEventListener('pointermove', onMove)
  document.addEventListener('pointerup', onUp)
}

// ─── Refresh on document update ──────────────────────────────────────────────

async function onDocumentUpdate() {
  await refresh()
  // Mark that we have unsaved embeddings and reset the idle timer
  hasUnsavedEmbeddings.value = true
  resetIdleTimer()
}

// ─── Lazy Embedding ──────────────────────────────────────────────────────────

const EMBED_IDLE_TIMEOUT = 30_000 // 30 seconds

const hasUnsavedEmbeddings = ref(false)
let idleTimer: ReturnType<typeof setTimeout> | null = null

function resetIdleTimer() {
  if (idleTimer) {
    clearTimeout(idleTimer)
  }
  idleTimer = setTimeout(triggerEmbedding, EMBED_IDLE_TIMEOUT)
}

async function triggerEmbedding() {
  if (!hasUnsavedEmbeddings.value) return

  try {
    await embedDocument(libraryId, documentId)
    hasUnsavedEmbeddings.value = false
  }
  catch (err) {
    // Non-critical — log and move on
    console.warn('[Embedding] Failed to embed document:', err)
  }
}

// Trigger embedding when navigating away (fire-and-forget)
onBeforeRouteLeave(() => {
  if (idleTimer) {
    clearTimeout(idleTimer)
    idleTimer = null
  }
  if (hasUnsavedEmbeddings.value) {
    // Fire and forget — don't block navigation
    embedDocument(libraryId, documentId).catch(() => {})
    hasUnsavedEmbeddings.value = false
  }
})

// Clean up timer on unmount
onUnmounted(() => {
  if (idleTimer) {
    clearTimeout(idleTimer)
    idleTimer = null
  }
})
</script>

<template>
  <!-- Navbar actions -->
  <Teleport defer to="#navbar-actions">
    <UTooltip text="Swap layout">
      <UButton
        :icon="chatPosition === 'left' ? 'i-lucide-panel-right-open' : 'i-lucide-panel-left-open'"
        color="neutral"
        variant="ghost"
        size="sm"
        @click="toggleChatPosition"
      />
    </UTooltip>
    <UTooltip text="Clear chat">
      <UButton
        icon="i-lucide-message-square-x"
        color="neutral"
        variant="ghost"
        size="sm"
        @click="showClearChatModal = true"
      />
    </UTooltip>
    <UButton
      icon="i-lucide-trash-2"
      color="error"
      variant="ghost"
      size="sm"
      @click="showDeleteModal = true"
    />
  </Teleport>

  <!-- Loading -->
  <div v-if="!doc && pending" class="flex items-center justify-center py-12">
    <UIcon name="i-lucide-loader-2" class="size-6 animate-spin text-muted" />
  </div>

  <!-- Error -->
  <EmptyState
    v-else-if="!doc && error"
    icon="i-lucide-alert-circle"
    title="Document not found"
    description="This document may have been deleted."
  >
    <UButton label="Back to Library" :to="`/libraries/${libraryId}`" />
  </EmptyState>

  <!-- Editor -->
  <div
    v-else-if="doc"
    ref="containerRef"
    class="flex h-full overflow-hidden"
    :class="[
      chatPosition === 'right' ? 'flex-row-reverse' : 'flex-row',
      isDragging ? 'select-none' : '',
    ]"
  >
    <!-- Chat Panel -->
    <div
      class="shrink-0 flex flex-col overflow-hidden"
      :style="{ width: chatWidthPct + '%' }"
    >
      <DocumentChat
        :key="chatKey"
        :library-id="libraryId"
        :document-id="documentId"
        :initial-messages="initialChatMessages"
        @update="onDocumentUpdate"
      />
    </div>

    <!-- Resize Handle -->
    <div
      class="shrink-0 w-px border-l border-default relative group cursor-col-resize hover:border-primary active:border-primary transition-colors"
      @pointerdown="onResizeStart"
    >
      <div class="absolute inset-y-0 -left-1 -right-1" />
    </div>

    <!-- Preview Panel -->
    <div class="flex-1 min-w-0 flex flex-col relative bg-elevated">
      <!-- Drag overlay -->
      <div v-if="isDragging" class="absolute inset-0 z-10" />

      <!-- Header -->
      <div class="flex items-center justify-between gap-2 px-4 py-2 border-b border-default">
        <div class="flex items-center gap-2 min-w-0">
          <UIcon name="i-lucide-file-text" class="size-4 text-muted shrink-0" />
          <span class="text-sm font-medium truncate">{{ doc.title }}</span>
        </div>
        <UBadge label="Generated" color="primary" variant="subtle" size="xs" />
      </div>

      <!-- Content -->
      <div class="flex-1 overflow-auto p-6">
        <div v-if="!doc.body" class="flex flex-col items-center justify-center h-full text-center">
          <UIcon name="i-lucide-file-text" class="size-12 text-muted mb-3" />
          <p class="text-muted">No content yet</p>
          <p class="text-sm text-dimmed mt-1">Start a conversation to generate your document.</p>
        </div>
        <div v-else class="prose prose-sm max-w-none">
          <MDC :value="doc.body" :cache-key="doc.id + '-' + doc.updatedAt" />
        </div>
      </div>
    </div>
  </div>

  <!-- Delete confirmation -->
  <ConfirmModal
    v-model:open="showDeleteModal"
    title="Delete Document"
    :description="`Are you sure you want to delete &quot;${doc?.title}&quot;? This action cannot be undone.`"
    confirm-label="Delete"
    confirm-color="error"
    :loading="deleting"
    @confirm="handleDelete"
  />

  <!-- Clear chat confirmation -->
  <ConfirmModal
    v-model:open="showClearChatModal"
    title="Clear Chat"
    description="This will clear the conversation history and the generated content. You'll start fresh."
    confirm-label="Clear"
    confirm-color="error"
    :loading="clearing"
    @confirm="handleClearChat"
  />
</template>
