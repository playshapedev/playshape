<script setup lang="ts">
import type { ChatMode } from '~/utils/chatMode'
import { getInitialChatMode } from '~/utils/chatMode'

definePageMeta({ noPadding: true })

const route = useRoute()
const router = useRouter()
const toast = useToast()
const { setTitle } = useNavbar()

const projectId = inject<string>('projectId')!
const courseId = route.params.courseId as string
const activityId = route.params.activityId as string

const { activity, pending, error, refresh } = useActivity(projectId, courseId, activityId)

// Set dynamic navbar title from activity name
watch(() => activity.value?.name, (name) => {
  if (name) setTitle(name)
}, { immediate: true })

// ─── Delete ──────────────────────────────────────────────────────────────────

const showDeleteModal = ref(false)
const deleting = ref(false)

async function handleDelete() {
  if (!activity.value) return
  deleting.value = true
  try {
    await deleteActivity(projectId, courseId, activity.value.id)
    toast.add({ title: 'Activity deleted', color: 'success' })
    // Clear the course cache so the list refreshes when we navigate back
    await clearNuxtData(getCourseKey(projectId, courseId))
    await router.push(`/projects/${projectId}/courses/${courseId}`)
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
const editDescription = ref('')
const saving = ref(false)

function openEdit() {
  if (!activity.value) return
  editName.value = activity.value.name
  editDescription.value = activity.value.description || ''
  showEditModal.value = true
}

async function handleSave() {
  if (!activity.value || !editName.value.trim()) return
  saving.value = true
  try {
    await updateActivity(projectId, courseId, activityId, {
      name: editName.value.trim(),
      description: editDescription.value.trim() || null,
    })
    showEditModal.value = false
    await refresh()
    toast.add({ title: 'Activity updated', color: 'success' })
  }
  catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Unknown error'
    toast.add({ title: 'Failed to update', description: message, color: 'error' })
  }
  finally {
    saving.value = false
  }
}

// ─── Clear Chat ──────────────────────────────────────────────────────────────

const showClearChatModal = ref(false)
const clearing = ref(false)
const chatKey = ref(0)

async function handleClearChat() {
  if (!activity.value) return
  clearing.value = true
  try {
    await updateActivity(projectId, courseId, activityId, { messages: [] })
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

// ─── Upgrade ─────────────────────────────────────────────────────────────────

const upgradeAvailable = computed(() => activity.value?.template?.upgradeAvailable ?? false)
const currentVersion = computed(() => activity.value?.template?.schemaVersion ?? 1)
const latestVersion = computed(() => activity.value?.template?.latestSchemaVersion ?? currentVersion.value)

const showUpgradeModal = ref(false)
const upgrading = ref(false)

async function handleUpgrade() {
  if (!activity.value) return
  upgrading.value = true
  try {
    await $fetch(`/api/projects/${projectId}/courses/${courseId}/activities/${activityId}/upgrade`, {
      method: 'POST',
    })
    showUpgradeModal.value = false
    await refresh()
    toast.add({
      title: 'Activity upgraded',
      description: `Upgraded to template v${latestVersion.value}`,
      color: 'success',
    })
  }
  catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Unknown error'
    toast.add({ title: 'Upgrade failed', description: message, color: 'error' })
  }
  finally {
    upgrading.value = false
  }
}

// ─── Layout ──────────────────────────────────────────────────────────────────

const templateChatRef = ref<{ reportPreviewError: (error: string) => void } | null>(null)

// Capture initial messages once so the prop reference stays stable across refresh()
const initialChatMessages = ref<any[]>([])
watch(() => activity.value?.messages, (messages) => {
  if (messages && !initialChatMessages.value.length) {
    initialChatMessages.value = messages as any[]
  }
}, { immediate: true })

// ─── Chat Mode (Plan / Build) ────────────────────────────────────────────────
// New chats default to Plan mode to encourage planning first.
// Existing chats default to Build mode to not disrupt ongoing work.

const mode = ref<ChatMode>('plan') // Will be set properly once messages are loaded

// Set mode based on initial messages once they're available
watch(initialChatMessages, (messages) => {
  if (messages) {
    mode.value = getInitialChatMode(messages.length > 0)
  }
}, { immediate: true })

// ─── Activity Chat Instance ──────────────────────────────────────────────────
// Created once when activity data loads. Must not re-create on every reactive update.

// shallowRef prevents Vue from deeply proxying the Chat class instance,
// which would break its internal reactive state (Refs for messages, status, etc.)
const chatInstance = shallowRef<ReturnType<typeof useActivityChat> | null>(null)
const chatInstanceReady = ref(false)

watchEffect(() => {
  if (activity.value && !chatInstanceReady.value) {
    const instance = useActivityChat(
      projectId,
      courseId,
      activityId,
      initialChatMessages.value,
      mode,
      {
        totalTokens: activity.value.totalTokens,
        promptTokens: activity.value.totalPromptTokens,
        completionTokens: activity.value.totalCompletionTokens,
      },
    )
    // Wire up the update callback so we refresh activity data after AI updates
    instance.onActivityUpdate.value = () => onActivityUpdated()
    chatInstance.value = instance
    chatInstanceReady.value = true
  }
})

// Build the external chat instance prop for TemplateChat.
// markRaw prevents Vue from deeply proxying the Chat class instance,
// which would unwrap its internal Refs and break its reactive state.
const externalChatInstance = computed(() => {
  if (!chatInstance.value) return undefined
  return markRaw({
    chat: chatInstance.value.chat,
    sendMessage: chatInstance.value.sendMessage,
    stopGeneration: chatInstance.value.stopGeneration,
    reportPreviewError: chatInstance.value.reportPreviewError,
    tokenUsage: chatInstance.value.tokenUsage,
  })
})

// ─── Tool indicators for activity chat ───────────────────────────────────────

const activityToolIndicators = {
  'tool-update_activity': {
    loadingLabel: 'Updating activity...',
    doneLabel: 'Activity updated',
    showFailure: true,
    failLabel: 'Update failed — retrying...',
  },
  'tool-get_template': {
    loadingLabel: 'Reading template...',
  },
  'tool-search_libraries': {
    loadingLabel: 'Searching libraries...',
    doneLabel: 'Search complete',
    doneIcon: 'i-lucide-search',
  },
}

// ─── Preview Data ────────────────────────────────────────────────────────────
// The preview shows the template component rendered with the activity's data.

const componentSource = computed(() => activity.value?.template?.component || '')
const previewData = computed(() => formData.value)
const dependencies = computed(() => (activity.value?.template?.dependencies as Array<{ name: string; url: string; global: string }>) ?? [])
const tools = computed(() => (activity.value?.template?.tools as string[]) ?? [])

// ─── Brand Preview ───────────────────────────────────────────────────────────

const { defaultBrand } = useBrands()
const selectedBrand = computed(() => defaultBrand.value ?? null)

// ─── Preview Error Feedback ──────────────────────────────────────────────────

function onPreviewError(error: string | null) {
  if (error) {
    templateChatRef.value?.reportPreviewError(error)
  }
}

// ─── Activity Updated (from AI tool call) ────────────────────────────────────

async function onActivityUpdated() {
  await refresh()
}

// ─── Resizable Panels ────────────────────────────────────────────────────────

const STORAGE_KEY = 'playshape:activity-chat-width'
const DEFAULT_CHAT_PCT = 30
const MIN_CHAT_PCT = 20
const MAX_CHAT_PCT = 60

const containerRef = ref<HTMLElement | null>(null)
const chatWidthPct = ref(
  parseFloat(typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) || '' : '') || DEFAULT_CHAT_PCT,
)

const isDragging = ref(false)

const chatPosition = ref<'left' | 'right'>(
  (typeof localStorage !== 'undefined' && localStorage.getItem('playshape:activity-chat-position') as 'left' | 'right') || 'left',
)

function toggleChatPosition() {
  chatPosition.value = chatPosition.value === 'left' ? 'right' : 'left'
  localStorage.setItem('playshape:activity-chat-position', chatPosition.value)
}

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

// ─── Data Form (view/edit activity data manually) ────────────────────────────

const showDataForm = ref(false)

interface InputField {
  id: string
  type: string
  label: string
  default?: unknown
  options?: string[]
  placeholder?: string
  required?: boolean
  min?: number
  max?: number
  fields?: InputField[]
}

const inputFields = computed<InputField[]>(() => (activity.value?.template?.inputSchema as InputField[]) || [])

// Local editable copy of the activity data, synced from the API and auto-saved back.
const formData = ref<Record<string, unknown>>({})

// When activity data changes (initial load or after AI update_activity tool),
// replace formData with the latest from the database.
let skipNextSave = false

watch(() => activity.value?.data, (data) => {
  if (data && typeof data === 'object') {
    skipNextSave = true
    formData.value = { ...data as Record<string, unknown> }
  }
}, { immediate: true })

// ─── Auto-save activity data ─────────────────────────────────────────────────

const saveStatus = ref<'idle' | 'saving' | 'saved'>('idle')
let saveTimeout: ReturnType<typeof setTimeout> | undefined
let savedTimeout: ReturnType<typeof setTimeout> | undefined

async function persistActivityData() {
  if (!activity.value) return
  saveStatus.value = 'saving'
  try {
    await updateActivity(projectId, courseId, activityId, { data: formData.value })
    saveStatus.value = 'saved'
    clearTimeout(savedTimeout)
    savedTimeout = setTimeout(() => {
      saveStatus.value = 'idle'
    }, 2000)
  }
  catch {
    saveStatus.value = 'idle'
  }
}

// Debounced save: triggers 1 second after user stops editing
watch(formData, () => {
  if (skipNextSave) {
    skipNextSave = false
    return
  }
  clearTimeout(saveTimeout)
  saveTimeout = setTimeout(persistActivityData, 1000)
}, { deep: true })
</script>

<template>
  <!-- Navbar actions -->
  <Teleport defer to="#navbar-actions">
    <!-- Upgrade available indicator -->
    <UTooltip v-if="upgradeAvailable" :text="`Upgrade to v${latestVersion}`">
      <UButton
        icon="i-lucide-arrow-up-circle"
        color="warning"
        variant="soft"
        size="sm"
        @click="showUpgradeModal = true"
      />
    </UTooltip>
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
      icon="i-lucide-pencil"
      color="neutral"
      variant="ghost"
      size="sm"
      @click="openEdit"
    />
    <UButton
      icon="i-lucide-trash-2"
      color="error"
      variant="ghost"
      size="sm"
      @click="showDeleteModal = true"
    />
  </Teleport>

  <!-- Loading -->
  <div v-if="!activity && pending" class="flex items-center justify-center py-12">
    <UIcon name="i-lucide-loader-2" class="size-6 animate-spin text-muted" />
  </div>

  <!-- Error -->
  <EmptyState
    v-else-if="!activity && error"
    icon="i-lucide-alert-circle"
    title="Activity not found"
    description="This activity may have been deleted."
  >
    <UButton label="Back to Course" :to="`/projects/${projectId}/courses/${courseId}`" />
  </EmptyState>

  <!-- Editor -->
  <div
    v-else-if="activity && externalChatInstance"
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
      <TemplateChat
        :key="chatKey"
        ref="templateChatRef"
        :initial-messages="initialChatMessages"
        :chat-instance="externalChatInstance"
        :external-mode="mode"
        :tool-indicators="activityToolIndicators"
        :update-tool-types="['tool-update_activity']"
        placeholder="Describe the activity content..."
        empty-message="Tell the AI what this activity should contain."
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
    <div class="flex-1 min-w-0 flex flex-col relative">
      <div v-if="isDragging" class="absolute inset-0 z-10" />
      <TemplatePreview
        :component-source="componentSource"
        :data="previewData"
        :input-schema="inputFields"
        :dependencies="dependencies"
        :tools="tools"
        :brand="selectedBrand"
        @error="onPreviewError"
      >
        <template #header-actions>
          <UButton
            v-if="inputFields.length"
            icon="i-lucide-sliders-horizontal"
            size="xs"
            variant="ghost"
            color="neutral"
            @click="showDataForm = true"
          />
        </template>
      </TemplatePreview>
    </div>
  </div>

  <!-- Edit modal -->
  <UModal v-model:open="showEditModal">
    <template #header>
      <h3 class="text-lg font-semibold">Edit Activity</h3>
    </template>
    <template #body>
      <div class="space-y-4">
        <UFormField label="Name" required>
          <UInput v-model="editName" placeholder="Activity name" autofocus @keydown.enter="handleSave" />
        </UFormField>
        <UFormField label="Description">
          <UTextarea v-model="editDescription" placeholder="Brief description..." :rows="3" />
        </UFormField>
      </div>
    </template>
    <template #footer>
      <div class="flex justify-end gap-2">
        <UButton label="Cancel" color="neutral" variant="ghost" @click="showEditModal = false" />
        <UButton label="Save" :loading="saving" :disabled="!editName.trim()" @click="handleSave" />
      </div>
    </template>
  </UModal>

  <!-- Delete confirmation -->
  <ConfirmModal
    v-model:open="showDeleteModal"
    title="Delete Activity"
    :description="`Are you sure you want to delete &quot;${activity?.name}&quot;? This action cannot be undone.`"
    confirm-label="Delete"
    confirm-color="error"
    :loading="deleting"
    @confirm="handleDelete"
  />

  <!-- Clear chat confirmation -->
  <ConfirmModal
    v-model:open="showClearChatModal"
    title="Clear Chat"
    description="This will clear the conversation history. The activity's data will be preserved."
    confirm-label="Clear"
    confirm-color="error"
    :loading="clearing"
    @confirm="handleClearChat"
  />

  <!-- Upgrade confirmation -->
  <ConfirmModal
    v-model:open="showUpgradeModal"
    title="Upgrade Activity"
    :description="`Upgrade this activity from template v${currentVersion} to v${latestVersion}. Your data will be automatically migrated to the new format.`"
    confirm-label="Upgrade"
    confirm-color="primary"
    :loading="upgrading"
    @confirm="handleUpgrade"
  />

  <!-- Data form slideover -->
  <USlideover v-model:open="showDataForm" title="Activity Data" description="Edit the activity's data fields. Changes auto-save." side="right">
    <template #body>
      <div class="space-y-4">
        <TemplateDataForm
          v-model="formData"
          :fields="inputFields"
        />
        <div v-if="saveStatus !== 'idle'" class="flex items-center gap-1.5 text-xs text-muted pt-2">
          <UIcon
            :name="saveStatus === 'saving' ? 'i-lucide-loader-2' : 'i-lucide-check'"
            :class="saveStatus === 'saving' ? 'size-3 animate-spin' : 'size-3 text-success'"
          />
          {{ saveStatus === 'saving' ? 'Saving...' : 'Saved' }}
        </div>
      </div>
    </template>
  </USlideover>
</template>
