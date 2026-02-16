<script setup lang="ts">
definePageMeta({ noPadding: true })

const route = useRoute()
const router = useRouter()
const toast = useToast()
const { setTitle } = useNavbar()

const templateId = route.params.id as string
const { template, pending, error, refresh } = useTemplate(templateId)

// Set dynamic navbar title from template name
watch(() => template.value?.name, (name) => {
  if (name) setTitle(name)
}, { immediate: true })

// ─── Delete ──────────────────────────────────────────────────────────────────

const showDeleteModal = ref(false)
const deleting = ref(false)

async function handleDelete() {
  if (!template.value) return
  deleting.value = true
  try {
    await deleteTemplate(template.value.id)
    toast.add({ title: 'Template deleted', color: 'success' })
    await router.push('/templates')
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
  if (!template.value) return
  editName.value = template.value.name
  editDescription.value = template.value.description || ''
  showEditModal.value = true
}

async function handleSave() {
  if (!template.value || !editName.value.trim()) return
  saving.value = true
  try {
    await updateTemplate(template.value.id, {
      name: editName.value.trim(),
      description: editDescription.value.trim(),
    })
    showEditModal.value = false
    await refresh()
    toast.add({ title: 'Template updated', color: 'success' })
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
  if (!template.value) return
  clearing.value = true
  try {
    await updateTemplate(template.value.id, { messages: [] })
    showClearChatModal.value = false
    initialChatMessages.value = [] // Reset so re-mount starts fresh
    chatKey.value++ // Force re-mount of TemplateChat
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

const templateChatRef = ref<{ reportPreviewError: (error: string) => void } | null>(null)
const templatePreviewRef = ref<{ generateThumbnail: () => Promise<string | null> } | null>(null)

// Capture initial messages once so the prop reference stays stable across refresh().
// TemplateChat only uses initialMessages in the Chat constructor — it doesn't need
// to react to changes. Passing template.messages directly causes the whole chat to
// re-render on every refresh() because useFetch returns a new array reference each time.
const initialChatMessages = ref<any[]>([])
watch(() => template.value?.messages, (messages) => {
  if (messages && !initialChatMessages.value.length) {
    initialChatMessages.value = messages as any[]
  }
}, { immediate: true })

// ─── Interface: Activity Slot Preview ────────────────────────────────────────

const isInterface = computed(() => template.value?.kind === 'interface')

// Fetch activity templates for the slot selector (only when editing an interface)
const { templates: activityTemplates } = useTemplates('activity')

// Only show activity templates that have a component to preview
const availableActivities = computed(() =>
  (activityTemplates.value || []).filter(t => t.component),
)

// The selected activity template ID for the slot preview
const selectedActivityId = ref<string | null>(null)

// Auto-select the first available activity when list loads
watch(availableActivities, (activities) => {
  if (activities.length && !selectedActivityId.value && activities[0]) {
    selectedActivityId.value = activities[0].id
  }
}, { immediate: true })

const selectedActivity = computed(() =>
  availableActivities.value.find(t => t.id === selectedActivityId.value) ?? null,
)

// Items for the activity selector dropdown
const activitySelectorItems = computed(() => [
  { label: 'No activity', value: '__none__' },
  ...availableActivities.value.map(a => ({ label: a.name, value: a.id })),
])

// Build the slotContent prop for TemplatePreview
const slotContent = computed(() => {
  if (!isInterface.value || !selectedActivity.value?.component) return null
  return {
    sfc: selectedActivity.value.component,
    data: (selectedActivity.value.sampleData as Record<string, unknown>) || {},
    dependencies: (selectedActivity.value.dependencies as Array<{ name: string; url: string; global: string }>) || [],
  }
})

const chatPosition = ref<'left' | 'right'>(
  (typeof localStorage !== 'undefined' && localStorage.getItem('playshape:template-chat-position') as 'left' | 'right') || 'left',
)

function toggleChatPosition() {
  chatPosition.value = chatPosition.value === 'left' ? 'right' : 'left'
  localStorage.setItem('playshape:template-chat-position', chatPosition.value)
}

// ─── Resizable Panels ────────────────────────────────────────────────────────

const STORAGE_KEY = 'playshape:template-chat-width'
const DEFAULT_CHAT_PCT = 30 // percentage
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

// ─── Data Form ───────────────────────────────────────────────────────────────

const showDataForm = ref(false)
const showTemplateSource = ref(false)

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

const formData = ref<Record<string, unknown>>({})

// Computed input schema typed properly
const inputFields = computed<InputField[]>(() => (template.value?.inputSchema as InputField[]) || [])

// When the template data changes (initial load or after update_template tool),
// replace formData with the persisted sampleData from the database.
// Skip auto-save when this happens (the data just came from the DB).
let skipNextSave = false

watch(() => template.value?.sampleData, (sampleData) => {
  if (sampleData && typeof sampleData === 'object') {
    skipNextSave = true
    formData.value = { ...sampleData as Record<string, unknown> }
  }
}, { immediate: true })

// ─── Auto-save sample data ──────────────────────────────────────────────────

const saveStatus = ref<'idle' | 'saving' | 'saved'>('idle')
let saveTimeout: ReturnType<typeof setTimeout> | undefined
let savedTimeout: ReturnType<typeof setTimeout> | undefined

async function persistSampleData() {
  if (!template.value) return
  saveStatus.value = 'saving'
  try {
    await updateTemplate(template.value.id, { sampleData: formData.value })
    saveStatus.value = 'saved'
    // Reset to idle after 2 seconds
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
  saveTimeout = setTimeout(persistSampleData, 1000)
}, { deep: true })

// ─── Preview Error Feedback ──────────────────────────────────────────────────

function onPreviewError(error: string | null) {
  if (error) {
    templateChatRef.value?.reportPreviewError(error)
  }
}

// ─── Thumbnail Generation ────────────────────────────────────────────────────

/**
 * Called when the `update_template` tool fires (@update from TemplateChat).
 * Refreshes template data, then generates and saves a thumbnail.
 */
async function onTemplateUpdated() {
  await refresh()
  // Generate thumbnail in the background — don't block the UI
  generateAndSaveThumbnail()
}

async function generateAndSaveThumbnail() {
  if (!template.value?.id || !template.value.component) return
  try {
    const thumbnail = await templatePreviewRef.value?.generateThumbnail()
    if (thumbnail) {
      await updateTemplate(template.value.id, { thumbnail })
    }
  }
  catch (err) {
    // Thumbnail generation is non-critical — log and move on
    console.warn('[Thumbnail] Generation failed:', err)
  }
}
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

  <!-- Loading (initial load only — never unmount the editor for a refresh) -->
  <div v-if="!template && pending" class="flex items-center justify-center py-12">
    <UIcon name="i-lucide-loader-2" class="size-6 animate-spin text-muted" />
  </div>

  <!-- Error -->
  <EmptyState
    v-else-if="!template && error"
    icon="i-lucide-alert-circle"
    title="Template not found"
    description="This template may have been deleted."
  >
    <UButton label="Back to Templates" to="/templates" />
  </EmptyState>

  <!-- Editor -->
  <div
    v-else-if="template"
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
        :template-id="template.id"
        :initial-messages="initialChatMessages"
        @update="onTemplateUpdated"
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
      <!-- Drag overlay: prevents the iframe from stealing pointer events during resize -->
      <div v-if="isDragging" class="absolute inset-0 z-10" />
      <TemplatePreview
        ref="templatePreviewRef"
        :component-source="template.component || ''"
        :data="formData"
        :dependencies="(template.dependencies as any[]) || []"
        :tools="(template.tools as string[]) || []"
        :slot-content="slotContent"
        @error="onPreviewError"
      >
        <template #header-actions>
          <!-- Activity selector for interface templates -->
          <USelectMenu
            v-if="isInterface && availableActivities.length"
            :model-value="selectedActivityId ?? '__none__'"
            :items="activitySelectorItems"
            value-key="value"
            placeholder="Select activity..."
            class="w-40"
            size="xs"
            @update:model-value="selectedActivityId = $event === '__none__' ? null : $event"
          />
          <!-- Save status indicator -->
          <Transition
            enter-active-class="transition-opacity duration-200"
            leave-active-class="transition-opacity duration-300"
            enter-from-class="opacity-0"
            leave-to-class="opacity-0"
          >
            <span v-if="saveStatus === 'saving'" class="flex items-center gap-1 text-xs text-muted">
              <UIcon name="i-lucide-loader-2" class="size-3 animate-spin" />
              Saving...
            </span>
            <span v-else-if="saveStatus === 'saved'" class="flex items-center gap-1 text-xs text-success">
              <UIcon name="i-lucide-check" class="size-3" />
              Saved
            </span>
          </Transition>
          <UButton
            v-if="template.component"
            icon="i-lucide-code"
            size="xs"
            variant="ghost"
            color="neutral"
            @click="showTemplateSource = true"
          />
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
      <h3 class="text-lg font-semibold">Edit Template</h3>
    </template>
    <template #body>
      <div class="space-y-4">
        <UFormField label="Name" required>
          <UInput v-model="editName" placeholder="Template name" autofocus @keydown.enter="handleSave" />
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
    title="Delete Template"
    :description="`Are you sure you want to delete &quot;${template?.name}&quot;? This action cannot be undone.`"
    confirm-label="Delete"
    confirm-color="error"
    :loading="deleting"
    @confirm="handleDelete"
  />

  <!-- Clear chat confirmation -->
  <ConfirmModal
    v-model:open="showClearChatModal"
    title="Clear Chat"
    description="This will clear the conversation history. The template's input schema and component will be preserved."
    confirm-label="Clear"
    confirm-color="error"
    :loading="clearing"
    @confirm="handleClearChat"
  />

  <!-- Data form slideover -->
  <USlideover v-model:open="showDataForm" title="Template Data" description="Edit the data passed to the template preview." side="right">
    <template #body>
      <TemplateDataForm
        v-model="formData"
        :fields="inputFields"
      />
    </template>
  </USlideover>

  <!-- Template source slideover -->
  <USlideover v-model:open="showTemplateSource" title="Template Source" description="The Vue component generated for this template." side="right">
    <template #body>
      <pre class="text-xs font-mono whitespace-pre-wrap break-words bg-elevated rounded-lg p-4 overflow-auto">{{ template?.component || 'No component generated yet.' }}</pre>
    </template>
  </USlideover>
</template>
