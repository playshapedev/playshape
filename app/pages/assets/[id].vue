<script setup lang="ts">
definePageMeta({ noPadding: true })

const route = useRoute()
const router = useRouter()
const toast = useToast()
const { setTitle } = useNavbar()

const assetId = route.params.id as string
const { asset, pending, error, refresh } = useAsset(assetId)

// Set dynamic navbar title from asset name
watch(() => asset.value?.name, (name) => {
  if (name) setTitle(name)
}, { immediate: true })

// ─── Delete ──────────────────────────────────────────────────────────────────

const showDeleteModal = ref(false)
const deleting = ref(false)

async function handleDelete() {
  if (!asset.value) return
  deleting.value = true
  try {
    await deleteAsset(asset.value.id)
    toast.add({ title: 'Asset deleted', color: 'success' })
    await clearNuxtData((key) => typeof key === 'string' && key.startsWith('/api/assets'))
    await router.push('/assets')
  }
  catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Unknown error'
    toast.add({ title: 'Failed to delete', description: message, color: 'error' })
  }
  finally {
    deleting.value = false
  }
}

// ─── Edit Name ───────────────────────────────────────────────────────────────

const showEditModal = ref(false)
const editName = ref('')
const saving = ref(false)

function openEdit() {
  if (!asset.value) return
  editName.value = asset.value.name
  showEditModal.value = true
}

async function handleSave() {
  if (!asset.value || !editName.value.trim()) return
  saving.value = true
  try {
    await updateAsset(asset.value.id, { name: editName.value.trim() })
    showEditModal.value = false
    await refresh()
    toast.add({ title: 'Asset renamed', color: 'success' })
  }
  catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Unknown error'
    toast.add({ title: 'Failed to rename', description: message, color: 'error' })
  }
  finally {
    saving.value = false
  }
}

// ─── Initial messages (stable reference) ────────────────────────────────────

const initialMessages = ref<any[]>([])
watch(() => asset.value?.messages, (messages) => {
  if (messages && !initialMessages.value.length) {
    initialMessages.value = messages as any[]
  }
}, { immediate: true })

// ─── Chat key for re-mounting ────────────────────────────────────────────────

const chatKey = ref(0)

// ─── Navbar Actions ──────────────────────────────────────────────────────────

const navbarActions = computed(() => [
  [
    { label: 'Rename', icon: 'i-lucide-pencil', onSelect: openEdit },
  ],
  [
    { label: 'Delete', icon: 'i-lucide-trash-2', color: 'error' as const, onSelect: () => { showDeleteModal.value = true } },
  ],
])

// ─── Resizable Panels ────────────────────────────────────────────────────────

const STORAGE_KEY = 'playshape:asset-chat-width'
const DEFAULT_CHAT_PCT = 35
const MIN_CHAT_PCT = 25
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
    let pct = ((ev.clientX - rect.left) / rect.width) * 100
    pct = Math.max(MIN_CHAT_PCT, Math.min(MAX_CHAT_PCT, pct))
    chatWidthPct.value = pct
  }

  const onUp = () => {
    isDragging.value = false
    localStorage.setItem(STORAGE_KEY, String(chatWidthPct.value))
    window.removeEventListener('pointermove', onMove)
    window.removeEventListener('pointerup', onUp)
  }

  window.addEventListener('pointermove', onMove)
  window.addEventListener('pointerup', onUp)
}
</script>

<template>
  <div v-if="pending && !asset" class="h-full flex items-center justify-center">
    <UIcon name="i-lucide-loader-2" class="size-6 animate-spin text-muted" />
  </div>

  <div v-else-if="error" class="h-full flex items-center justify-center">
    <div class="text-center">
      <UIcon name="i-lucide-alert-circle" class="size-8 text-error mb-2" />
      <p class="text-error">Failed to load asset</p>
      <UButton class="mt-4" @click="refresh">
        Retry
      </UButton>
    </div>
  </div>

  <div v-else-if="asset" ref="containerRef" class="h-full flex overflow-hidden">
    <!-- Chat Panel -->
    <div
      class="h-full border-r border-default overflow-hidden flex-shrink-0"
      :style="{ width: chatWidthPct + '%' }"
    >
      <AssetChat
        :key="chatKey"
        :asset-id="assetId"
        :initial-messages="initialMessages"
        @update="refresh"
      />
    </div>

    <!-- Resize Handle -->
    <div
      class="w-1 h-full cursor-col-resize bg-transparent hover:bg-primary/20 transition-colors flex-shrink-0"
      :class="{ 'bg-primary/30': isDragging }"
      @pointerdown="onResizeStart"
    />

    <!-- Preview Panel -->
    <div class="flex-1 h-full overflow-hidden">
      <AssetPreview :asset="asset" />
    </div>

    <!-- Navbar actions dropdown -->
    <Teleport to="#navbar-actions">
      <UDropdownMenu :items="navbarActions">
        <UButton
          icon="i-lucide-more-horizontal"
          variant="ghost"
          color="neutral"
        />
      </UDropdownMenu>
    </Teleport>
  </div>

  <!-- Edit Name Modal -->
  <UModal v-model:open="showEditModal" title="Rename Asset">
    <template #body>
      <UInput
        v-model="editName"
        placeholder="Asset name"
        autofocus
        @keydown.enter="handleSave"
      />
    </template>
    <template #footer>
      <div class="flex justify-end gap-2">
        <UButton variant="ghost" color="neutral" @click="showEditModal = false">
          Cancel
        </UButton>
        <UButton :loading="saving" :disabled="!editName.trim()" @click="handleSave">
          Save
        </UButton>
      </div>
    </template>
  </UModal>

  <!-- Delete Confirmation -->
  <ConfirmModal
    v-model:open="showDeleteModal"
    title="Delete Asset"
    :description="`Delete '${asset?.name}'? This cannot be undone.`"
    confirm-label="Delete"
    confirm-color="error"
    :loading="deleting"
    @confirm="handleDelete"
  />
</template>
