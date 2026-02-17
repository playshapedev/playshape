<script setup lang="ts">
definePageMeta({ layout: 'dashboard' })

const route = useRoute()
const router = useRouter()
const toast = useToast()
const { setTitle } = useNavbar()

const libraryId = route.params.id as string
const { library, pending, error, refresh: refreshLibrary } = useLibrary(libraryId)
const { documents, pending: docsPending, refresh: refreshDocs } = useLibraryDocuments(libraryId)

// Set dynamic navbar title from library name
watch(() => library.value?.name, (name) => {
  if (name) setTitle(name)
}, { immediate: true })

// ─── Library edit/delete ─────────────────────────────────────────────────────

const showDeleteModal = ref(false)
const deleting = ref(false)

const showEditModal = ref(false)
const editName = ref('')
const editDescription = ref('')
const saving = ref(false)

function openEdit() {
  if (!library.value) return
  editName.value = library.value.name
  editDescription.value = library.value.description || ''
  showEditModal.value = true
}

async function handleSave() {
  if (!library.value || !editName.value.trim()) return
  saving.value = true
  try {
    await updateLibrary(library.value.id, {
      name: editName.value.trim(),
      description: editDescription.value.trim(),
    })
    showEditModal.value = false
    await refreshLibrary()
    toast.add({ title: 'Library updated', color: 'success' })
  }
  catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Unknown error'
    toast.add({ title: 'Failed to update', description: message, color: 'error' })
  }
  finally {
    saving.value = false
  }
}

async function handleDeleteLibrary() {
  if (!library.value) return
  deleting.value = true
  try {
    await deleteLibrary(library.value.id)
    toast.add({ title: 'Library deleted', color: 'success' })
    await router.push('/libraries')
  }
  catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Unknown error'
    toast.add({ title: 'Failed to delete', description: message, color: 'error' })
  }
  finally {
    deleting.value = false
  }
}

// ─── Document upload ─────────────────────────────────────────────────────────

const uploading = ref(false)
const isDragging = ref(false)

const ACCEPTED_TYPES = [
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  'text/plain',
]
const ACCEPTED_EXTENSIONS = '.pdf,.docx,.pptx,.txt'

async function handleFileUpload(files: FileList | File[]) {
  uploading.value = true
  let successCount = 0
  let failCount = 0

  for (const file of Array.from(files)) {
    try {
      await uploadDocument(libraryId, file)
      successCount++
    }
    catch (e: unknown) {
      failCount++
      const message = e instanceof Error ? e.message : 'Unknown error'
      toast.add({ title: `Failed to upload ${file.name}`, description: message, color: 'error' })
    }
  }

  uploading.value = false
  if (successCount > 0) {
    toast.add({
      title: `${successCount} ${successCount === 1 ? 'document' : 'documents'} uploaded`,
      color: 'success',
    })
    await refreshDocs()
    await refreshLibrary()
  }
}

function onFileInput(event: Event) {
  const input = event.target as HTMLInputElement
  if (input.files?.length) {
    handleFileUpload(input.files)
    input.value = '' // Reset so the same file can be re-uploaded
  }
}

function onDrop(event: DragEvent) {
  isDragging.value = false
  if (event.dataTransfer?.files.length) {
    // Filter to accepted types
    const files = Array.from(event.dataTransfer.files).filter((file) => {
      const ext = '.' + file.name.split('.').pop()?.toLowerCase()
      return ACCEPTED_TYPES.includes(file.type) || ACCEPTED_EXTENSIONS.split(',').includes(ext)
    })
    if (files.length) {
      handleFileUpload(files)
    }
    else {
      toast.add({ title: 'Unsupported file type', description: 'Supported: PDF, DOCX, PPTX, TXT', color: 'warning' })
    }
  }
}

// ─── Text paste ──────────────────────────────────────────────────────────────

const showTextModal = ref(false)
const textTitle = ref('')
const textContent = ref('')
const savingText = ref(false)

async function handleTextSubmit() {
  if (!textTitle.value.trim() || !textContent.value.trim()) return
  savingText.value = true
  try {
    await createTextDocument(libraryId, {
      title: textTitle.value.trim(),
      content: textContent.value.trim(),
    })
    showTextModal.value = false
    textTitle.value = ''
    textContent.value = ''
    await refreshDocs()
    await refreshLibrary()
    toast.add({ title: 'Text document added', color: 'success' })
  }
  catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Unknown error'
    toast.add({ title: 'Failed to add text', description: message, color: 'error' })
  }
  finally {
    savingText.value = false
  }
}

// ─── Semantic search ─────────────────────────────────────────────────────────

const searchQuery = ref('')
const searchResults = ref<SearchResult[]>([])
const searching = ref(false)
const hasSearched = ref(false)

async function handleSearch() {
  const q = searchQuery.value.trim()
  if (!q) return

  searching.value = true
  hasSearched.value = true
  try {
    searchResults.value = await searchLibrary(libraryId, q)
  }
  catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Unknown error'
    toast.add({ title: 'Search failed', description: message, color: 'error' })
    searchResults.value = []
  }
  finally {
    searching.value = false
  }
}

function clearSearch() {
  searchQuery.value = ''
  searchResults.value = []
  hasSearched.value = false
}

// ─── Document actions ────────────────────────────────────────────────────────

const documentToDelete = ref<string | null>(null)
const showDeleteDocModal = ref(false)
const deletingDoc = ref(false)

function confirmDeleteDocument(docId: string) {
  documentToDelete.value = docId
  showDeleteDocModal.value = true
}

async function handleDeleteDocument() {
  if (!documentToDelete.value) return
  deletingDoc.value = true
  try {
    await deleteDocument(libraryId, documentToDelete.value)
    showDeleteDocModal.value = false
    documentToDelete.value = null
    await refreshDocs()
    await refreshLibrary()
    toast.add({ title: 'Document deleted', color: 'success' })
  }
  catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Unknown error'
    toast.add({ title: 'Failed to delete document', description: message, color: 'error' })
  }
  finally {
    deletingDoc.value = false
  }
}

// ─── Document preview ────────────────────────────────────────────────────────

const previewDoc = ref<{ title: string; body: string; sourceType: string } | null>(null)
const showPreview = ref(false)

function openPreview(doc: { title: string; body: string; sourceType: string }) {
  previewDoc.value = doc
  showPreview.value = true
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function sourceTypeIcon(sourceType: string): string {
  switch (sourceType) {
    case 'pdf': return 'i-lucide-file-text'
    case 'docx': return 'i-lucide-file-type'
    case 'pptx': return 'i-lucide-presentation'
    case 'txt': return 'i-lucide-file'
    case 'text': return 'i-lucide-text'
    default: return 'i-lucide-file'
  }
}

function sourceTypeLabel(sourceType: string): string {
  switch (sourceType) {
    case 'pdf': return 'PDF'
    case 'docx': return 'Word'
    case 'pptx': return 'PowerPoint'
    case 'txt': return 'Text file'
    case 'text': return 'Pasted text'
    default: return sourceType.toUpperCase()
  }
}

function statusColor(status: string): 'success' | 'warning' | 'error' {
  switch (status) {
    case 'ready': return 'success'
    case 'processing': return 'warning'
    case 'error': return 'error'
    default: return 'warning'
  }
}

function formatFileSize(bytes: number | null): string {
  if (!bytes) return ''
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}
</script>

<template>
  <!-- Navbar actions -->
  <Teleport defer to="#navbar-actions">
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
  <div v-if="pending" class="flex items-center justify-center py-12">
    <UIcon name="i-lucide-loader-2" class="size-6 animate-spin text-muted" />
  </div>

  <!-- Error -->
  <EmptyState
    v-else-if="error"
    icon="i-lucide-alert-circle"
    title="Library not found"
    description="This library doesn't exist or has been deleted."
  >
    <UButton label="Back to Libraries" to="/libraries" />
  </EmptyState>

  <!-- Library content -->
  <div v-else-if="library" class="space-y-6">
    <!-- Description -->
    <p v-if="library.description" class="text-muted">
      {{ library.description }}
    </p>

    <!-- Upload zone -->
    <div
      class="border-2 border-dashed rounded-lg p-8 text-center transition-colors"
      :class="isDragging ? 'border-primary bg-primary/5' : 'border-muted'"
      @dragover.prevent="isDragging = true"
      @dragleave.prevent="isDragging = false"
      @drop.prevent="onDrop"
    >
      <div v-if="uploading" class="flex flex-col items-center gap-2">
        <UIcon name="i-lucide-loader-2" class="size-8 animate-spin text-primary" />
        <p class="text-sm text-muted">Processing files...</p>
      </div>
      <div v-else class="flex flex-col items-center gap-3">
        <UIcon name="i-lucide-upload-cloud" class="size-10 text-muted" />
        <div class="space-y-1">
          <p class="text-sm font-medium text-highlighted">
            Drop files here or click to upload
          </p>
          <p class="text-xs text-dimmed">
            PDF, DOCX, PPTX, or TXT
          </p>
        </div>
        <div class="flex gap-2">
          <UButton
            label="Browse Files"
            icon="i-lucide-folder-open"
            variant="soft"
            size="sm"
            @click="($refs.fileInput as HTMLInputElement).click()"
          />
          <UButton
            label="Paste Text"
            icon="i-lucide-text"
            variant="soft"
            color="neutral"
            size="sm"
            @click="showTextModal = true"
          />
        </div>
      </div>
      <input
        ref="fileInput"
        type="file"
        :accept="ACCEPTED_EXTENSIONS"
        multiple
        class="hidden"
        @change="onFileInput"
      >
    </div>

    <!-- Search -->
    <div v-if="documents?.length" class="space-y-3">
      <div class="flex gap-2">
        <UInput
          v-model="searchQuery"
          placeholder="Search documents semantically..."
          icon="i-lucide-search"
          class="flex-1"
          @keydown.enter="handleSearch"
        />
        <UButton
          label="Search"
          :loading="searching"
          :disabled="!searchQuery.trim()"
          @click="handleSearch"
        />
        <UButton
          v-if="hasSearched"
          icon="i-lucide-x"
          color="neutral"
          variant="ghost"
          @click="clearSearch"
        />
      </div>

      <!-- Search results -->
      <div v-if="searching" class="flex items-center justify-center py-6">
        <UIcon name="i-lucide-loader-2" class="size-5 animate-spin text-muted" />
        <span class="ml-2 text-sm text-muted">Searching...</span>
      </div>

      <div v-else-if="hasSearched && searchResults.length === 0" class="py-4 text-center">
        <p class="text-sm text-muted">No matching content found.</p>
      </div>

      <div v-else-if="searchResults.length > 0" class="space-y-2">
        <h3 class="text-sm font-medium text-muted uppercase tracking-wide">
          Results ({{ searchResults.length }})
        </h3>
        <div class="space-y-2">
          <UCard
            v-for="result in searchResults"
            :key="result.id"
            class="text-sm"
          >
            <div class="space-y-2">
              <div class="flex items-center justify-between gap-2">
                <span v-if="result.document" class="font-medium text-highlighted truncate">
                  {{ result.document.title }}
                </span>
                <UBadge
                  :label="`${(result.score * 100).toFixed(0)}%`"
                  color="primary"
                  size="xs"
                  variant="subtle"
                />
              </div>
              <p class="text-muted line-clamp-3 whitespace-pre-wrap">{{ result.text }}</p>
            </div>
          </UCard>
        </div>
      </div>
    </div>

    <!-- Documents list -->
    <div v-if="docsPending" class="flex items-center justify-center py-8">
      <UIcon name="i-lucide-loader-2" class="size-5 animate-spin text-muted" />
    </div>

    <EmptyState
      v-else-if="!documents?.length"
      icon="i-lucide-file-text"
      title="No documents yet"
      description="Upload files or paste text to add source content to this library."
    />

    <div v-else class="space-y-2">
      <h3 class="text-sm font-medium text-muted uppercase tracking-wide">
        Documents ({{ documents.length }})
      </h3>
      <div class="divide-y divide-default">
        <div
          v-for="doc in documents"
          :key="doc.id"
          class="flex items-center gap-3 py-3 group"
        >
          <!-- Type icon -->
          <div class="shrink-0 rounded-md bg-muted/10 p-2">
            <UIcon :name="sourceTypeIcon(doc.sourceType)" class="size-5 text-muted" />
          </div>

          <!-- Info -->
          <div
            class="flex-1 min-w-0 cursor-pointer"
            @click="openPreview(doc)"
          >
            <p class="font-medium text-highlighted truncate">
              {{ doc.title }}
            </p>
            <p v-if="doc.summary" class="text-sm text-muted line-clamp-2 mt-0.5">
              {{ doc.summary }}
            </p>
            <div class="flex items-center gap-2 text-xs text-dimmed mt-1">
              <span>{{ sourceTypeLabel(doc.sourceType) }}</span>
              <span v-if="doc.fileSize">{{ formatFileSize(doc.fileSize) }}</span>
              <UBadge
                :label="doc.status"
                :color="statusColor(doc.status)"
                size="xs"
                variant="subtle"
              />
              <span v-if="doc.error" class="text-error truncate max-w-48">
                {{ doc.error }}
              </span>
            </div>
          </div>

          <!-- Actions -->
          <UButton
            icon="i-lucide-trash-2"
            color="error"
            variant="ghost"
            size="xs"
            class="opacity-0 group-hover:opacity-100 transition-opacity"
            @click="confirmDeleteDocument(doc.id)"
          />
        </div>
      </div>
    </div>
  </div>

  <!-- Edit library modal -->
  <UModal v-model:open="showEditModal">
    <template #header>
      <h3 class="text-lg font-semibold">Edit Library</h3>
    </template>
    <template #body>
      <div class="space-y-4">
        <UFormField label="Name" required>
          <UInput
            v-model="editName"
            placeholder="Library name"
            autofocus
            @keydown.enter="handleSave"
          />
        </UFormField>
        <UFormField label="Description">
          <UTextarea
            v-model="editDescription"
            placeholder="Brief description..."
            :rows="3"
          />
        </UFormField>
      </div>
    </template>
    <template #footer>
      <div class="flex justify-end gap-2">
        <UButton
          label="Cancel"
          color="neutral"
          variant="ghost"
          @click="showEditModal = false"
        />
        <UButton
          label="Save"
          :loading="saving"
          :disabled="!editName.trim()"
          @click="handleSave"
        />
      </div>
    </template>
  </UModal>

  <!-- Delete library confirmation -->
  <ConfirmModal
    v-model:open="showDeleteModal"
    title="Delete Library"
    description="Are you sure you want to delete this library? All documents and their content will be permanently removed. Projects linked to this library will lose access."
    confirm-label="Delete"
    confirm-color="error"
    :loading="deleting"
    @confirm="handleDeleteLibrary"
  />

  <!-- Add text modal -->
  <UModal v-model:open="showTextModal">
    <template #header>
      <h3 class="text-lg font-semibold">Add Text Content</h3>
    </template>
    <template #body>
      <div class="space-y-4">
        <UFormField label="Title" required>
          <UInput
            v-model="textTitle"
            placeholder="e.g. Company Overview, Product FAQ"
            autofocus
          />
        </UFormField>
        <UFormField label="Content" required>
          <UTextarea
            v-model="textContent"
            placeholder="Paste your text content here..."
            :rows="10"
          />
        </UFormField>
      </div>
    </template>
    <template #footer>
      <div class="flex justify-end gap-2">
        <UButton
          label="Cancel"
          color="neutral"
          variant="ghost"
          @click="showTextModal = false"
        />
        <UButton
          label="Add"
          :loading="savingText"
          :disabled="!textTitle.trim() || !textContent.trim()"
          @click="handleTextSubmit"
        />
      </div>
    </template>
  </UModal>

  <!-- Delete document confirmation -->
  <ConfirmModal
    v-model:open="showDeleteDocModal"
    title="Delete Document"
    description="Are you sure you want to delete this document? The extracted content and all chunks will be permanently removed."
    confirm-label="Delete"
    confirm-color="error"
    :loading="deletingDoc"
    @confirm="handleDeleteDocument"
  />

  <!-- Document preview slideover -->
  <USlideover v-model:open="showPreview" :title="previewDoc?.title || 'Document'" side="right">
    <template #body>
      <div v-if="previewDoc" class="space-y-4">
        <div class="flex items-center gap-2 text-sm text-muted">
          <UIcon :name="sourceTypeIcon(previewDoc.sourceType)" class="size-4" />
          <span>{{ sourceTypeLabel(previewDoc.sourceType) }}</span>
        </div>

        <!-- Summary -->
        <div v-if="previewDoc.summary" class="p-3 rounded-lg bg-elevated border border-default">
          <div class="flex items-center gap-1.5 text-xs font-medium text-muted mb-1.5">
            <UIcon name="i-lucide-sparkles" class="size-3" />
            Summary
          </div>
          <p class="text-sm">{{ previewDoc.summary }}</p>
        </div>

        <!-- Full content -->
        <div>
          <div class="text-xs font-medium text-muted mb-2">Full Content</div>
          <div class="prose prose-sm max-w-none whitespace-pre-wrap text-sm">
            {{ previewDoc.body }}
          </div>
        </div>
      </div>
    </template>
  </USlideover>
</template>
