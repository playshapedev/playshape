<script setup lang="ts">
const route = useRoute()
const router = useRouter()
const toast = useToast()
const { setTitle } = useNavbar()

const projectId = inject<string>('projectId')!
const courseId = route.params.courseId as string

const { course, pending, error, refresh } = useCourse(projectId, courseId)

// ─── Interface templates for the selector ────────────────────────────────────

const { templates: interfaceTemplates } = useTemplates('interface')

const templateOptions = computed(() =>
  (interfaceTemplates.value ?? [])
    .filter(t => t.status === 'published' || t.component)
    .map(t => ({ label: t.name, value: t.id })),
)

// ─── Set navbar title to course name ─────────────────────────────────────────

watch(() => course.value?.name, (name) => {
  if (name) setTitle(name)
}, { immediate: true })

// ─── Computed helpers ────────────────────────────────────────────────────────

const sections = computed(() => course.value?.sections ?? [])
const hasMultipleSections = computed(() => sections.value.length > 1)

// ─── Export ──────────────────────────────────────────────────────────────────

const showExportDialog = ref(false)

// ─── Edit course ─────────────────────────────────────────────────────────────

const showEditModal = ref(false)
const editName = ref('')
const editDescription = ref('')
const editTemplateId = ref<string | null>(null)
const saving = ref(false)

function openEditModal() {
  if (!course.value) return
  editName.value = course.value.name
  editDescription.value = course.value.description ?? ''
  editTemplateId.value = course.value.templateId ?? null
  showEditModal.value = true
}

async function handleSave() {
  if (!course.value || !editName.value.trim()) return
  saving.value = true
  try {
    await updateCourse(projectId, courseId, {
      name: editName.value.trim(),
      description: editDescription.value.trim() || null,
      templateId: editTemplateId.value,
    })
    showEditModal.value = false
    await refresh()
    toast.add({ title: 'Course updated', color: 'success' })
  }
  catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Unknown error'
    toast.add({ title: 'Failed to update course', description: message, color: 'error' })
  }
  finally {
    saving.value = false
  }
}

// ─── Change template inline ──────────────────────────────────────────────────

async function handleTemplateChange(templateId: string | null) {
  if (!course.value) return
  try {
    await updateCourse(projectId, courseId, { templateId })
    await refresh()
  }
  catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Unknown error'
    toast.add({ title: 'Failed to update template', description: message, color: 'error' })
  }
}

// ─── Delete course ───────────────────────────────────────────────────────────

const showDeleteModal = ref(false)
const deleting = ref(false)

async function handleDelete() {
  deleting.value = true
  try {
    await deleteCourse(projectId, courseId)
    toast.add({ title: 'Course deleted', color: 'success' })
    await router.push(`/projects/${projectId}/courses`)
  }
  catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Unknown error'
    toast.add({ title: 'Failed to delete course', description: message, color: 'error' })
  }
  finally {
    deleting.value = false
  }
}

// ─── Add section ─────────────────────────────────────────────────────────────
// When transitioning from 1 → 2 sections, prompt to title the first section.

const showAddSectionModal = ref(false)
const showNameFirstSectionModal = ref(false)
const newSectionTitle = ref('')
const firstSectionTitle = ref('')
const addingSection = ref(false)

function initiateAddSection() {
  if (!hasMultipleSections.value) {
    // Transitioning from 1 → 2: prompt to name the existing section first
    firstSectionTitle.value = ''
    newSectionTitle.value = ''
    showNameFirstSectionModal.value = true
  }
  else {
    newSectionTitle.value = ''
    showAddSectionModal.value = true
  }
}

async function handleAddSectionAfterNaming() {
  if (!course.value) return
  addingSection.value = true
  try {
    const existingSection = sections.value[0]
    if (existingSection && firstSectionTitle.value.trim()) {
      await updateSection(projectId, courseId, existingSection.id, {
        title: firstSectionTitle.value.trim(),
      })
    }
    await createSection(projectId, courseId, {
      title: newSectionTitle.value.trim() || null,
    })
    showNameFirstSectionModal.value = false
    await refresh()
    toast.add({ title: 'Section added', color: 'success' })
  }
  catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Unknown error'
    toast.add({ title: 'Failed to add section', description: message, color: 'error' })
  }
  finally {
    addingSection.value = false
  }
}

async function handleAddSection() {
  addingSection.value = true
  try {
    await createSection(projectId, courseId, {
      title: newSectionTitle.value.trim() || null,
    })
    showAddSectionModal.value = false
    await refresh()
    toast.add({ title: 'Section added', color: 'success' })
  }
  catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Unknown error'
    toast.add({ title: 'Failed to add section', description: message, color: 'error' })
  }
  finally {
    addingSection.value = false
  }
}

// ─── Edit section title ──────────────────────────────────────────────────────

const showEditSectionModal = ref(false)
const editSectionId = ref<string | null>(null)
const editSectionTitle = ref('')
const savingSection = ref(false)

function openEditSection(sectionId: string, title: string | null) {
  editSectionId.value = sectionId
  editSectionTitle.value = title ?? ''
  showEditSectionModal.value = true
}

async function handleSaveSection() {
  if (!editSectionId.value) return
  savingSection.value = true
  try {
    await updateSection(projectId, courseId, editSectionId.value, {
      title: editSectionTitle.value.trim() || null,
    })
    showEditSectionModal.value = false
    await refresh()
  }
  catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Unknown error'
    toast.add({ title: 'Failed to update section', description: message, color: 'error' })
  }
  finally {
    savingSection.value = false
  }
}

// ─── Delete section ──────────────────────────────────────────────────────────

const showDeleteSectionModal = ref(false)
const sectionToDelete = ref<string | null>(null)
const deletingSection = ref(false)

function confirmDeleteSection(sectionId: string) {
  sectionToDelete.value = sectionId
  showDeleteSectionModal.value = true
}

async function handleDeleteSection() {
  if (!sectionToDelete.value) return
  deletingSection.value = true
  try {
    await deleteSection(projectId, courseId, sectionToDelete.value)
    showDeleteSectionModal.value = false
    sectionToDelete.value = null
    await refresh()
    toast.add({ title: 'Section deleted', color: 'success' })
  }
  catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Unknown error'
    toast.add({ title: 'Failed to delete section', description: message, color: 'error' })
  }
  finally {
    deletingSection.value = false
  }
}

// ─── Add activity ────────────────────────────────────────────────────────────

const { templates: activityTemplates } = useTemplates('activity')

const activityTemplateOptions = computed(() =>
  (activityTemplates.value ?? [])
    .filter(t => t.component)
    .map(t => ({ label: t.name, value: t.id })),
)

const showAddActivityModal = ref(false)
const addActivitySectionId = ref<string | null>(null)
const newActivityName = ref('')
const newActivityTemplateId = ref<string | null>(null)
const addingActivity = ref(false)

function openAddActivity(sectionId: string) {
  addActivitySectionId.value = sectionId
  newActivityName.value = ''
  newActivityTemplateId.value = activityTemplateOptions.value[0]?.value ?? null
  showAddActivityModal.value = true
}

async function handleAddActivity() {
  if (!addActivitySectionId.value || !newActivityName.value.trim() || !newActivityTemplateId.value) return
  addingActivity.value = true
  try {
    const activity = await createActivity(projectId, courseId, addActivitySectionId.value, {
      name: newActivityName.value.trim(),
      templateId: newActivityTemplateId.value,
    })
    showAddActivityModal.value = false
    await refresh()
    // Navigate directly to the activity editor
    await router.push(`/projects/${projectId}/courses/${courseId}/activities/${activity.id}`)
  }
  catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Unknown error'
    toast.add({ title: 'Failed to create activity', description: message, color: 'error' })
  }
  finally {
    addingActivity.value = false
  }
}

// ─── Delete activity ─────────────────────────────────────────────────────────

const showDeleteActivityModal = ref(false)
const activityToDelete = ref<string | null>(null)
const deletingActivity = ref(false)

function confirmDeleteActivity(activityId: string) {
  activityToDelete.value = activityId
  showDeleteActivityModal.value = true
}

async function handleDeleteActivity() {
  if (!activityToDelete.value) return
  deletingActivity.value = true
  try {
    await deleteActivity(projectId, courseId, activityToDelete.value)
    showDeleteActivityModal.value = false
    activityToDelete.value = null
    await refresh()
    toast.add({ title: 'Activity deleted', color: 'success' })
  }
  catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Unknown error'
    toast.add({ title: 'Failed to delete activity', description: message, color: 'error' })
  }
  finally {
    deletingActivity.value = false
  }
}
</script>

<template>
  <!-- Navbar actions -->
  <Teleport defer to="#navbar-actions">
    <UButton
      icon="i-lucide-package"
      color="neutral"
      variant="ghost"
      size="sm"
      title="Export as SCORM"
      @click="showExportDialog = true"
    />
    <UButton
      icon="i-lucide-pencil"
      color="neutral"
      variant="ghost"
      size="sm"
      @click="openEditModal"
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
    title="Course not found"
    description="This course doesn't exist or has been deleted."
  >
    <UButton label="Back to Courses" :to="`/projects/${projectId}/courses`" />
  </EmptyState>

  <!-- Course content -->
  <div v-else-if="course" class="space-y-6">
    <!-- Course header -->
    <div class="space-y-3">
      <p v-if="course.description" class="text-muted">
        {{ course.description }}
      </p>

      <!-- Interface template selector -->
      <div class="flex items-center gap-3">
        <span class="text-sm text-muted shrink-0">Interface:</span>
        <USelect
          :model-value="course.templateId"
          :items="templateOptions"
          value-key="value"
          placeholder="No template selected"
          size="sm"
          class="w-64"
          @update:model-value="handleTemplateChange"
        />
        <NuxtLink to="/templates" class="text-xs text-primary hover:underline shrink-0">
          Create new
        </NuxtLink>
      </div>
    </div>

    <USeparator />

    <!-- Sections -->
    <div class="space-y-4">
      <div
        v-for="section in sections"
        :key="section.id"
        class="space-y-3"
      >
        <!-- Section header (only shown when multiple sections) -->
        <div v-if="hasMultipleSections" class="flex items-center gap-2 group">
          <UIcon name="i-lucide-grip-vertical" class="size-4 text-dimmed cursor-grab shrink-0" />
          <h3 class="text-sm font-medium text-highlighted flex-1">
            {{ section.title || 'Untitled Section' }}
          </h3>
          <div class="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
            <UButton
              icon="i-lucide-pencil"
              color="neutral"
              variant="ghost"
              size="xs"
              @click="openEditSection(section.id, section.title)"
            />
            <UButton
              icon="i-lucide-trash-2"
              color="error"
              variant="ghost"
              size="xs"
              @click="confirmDeleteSection(section.id)"
            />
          </div>
        </div>

        <!-- Activities list within section -->
        <div
          class="space-y-2"
          :class="{ 'pl-6': hasMultipleSections }"
        >
          <NuxtLink
            v-for="activity in section.activities"
            :key="activity.id"
            :to="`/projects/${projectId}/courses/${courseId}/activities/${activity.id}`"
            class="flex items-center gap-3 p-3 rounded-lg border border-default hover:bg-elevated/50 transition-colors group cursor-pointer"
          >
            <UIcon name="i-lucide-play-circle" class="size-4 text-muted shrink-0" />
            <span class="text-sm font-medium text-highlighted flex-1">{{ activity.name }}</span>
            <UBadge
              v-if="activity.templateName"
              :label="activity.templateName"
              size="xs"
              color="neutral"
              variant="subtle"
            />
            <UButton
              icon="i-lucide-trash-2"
              color="error"
              variant="ghost"
              size="xs"
              class="opacity-0 group-hover:opacity-100 transition-opacity"
              @click.prevent="confirmDeleteActivity(activity.id)"
            />
          </NuxtLink>

          <!-- Add activity button -->
          <button
            class="flex items-center gap-2 w-full p-3 rounded-lg border border-dashed border-muted hover:border-primary hover:bg-elevated/30 transition-colors text-sm text-dimmed hover:text-primary cursor-pointer"
            @click="openAddActivity(section.id)"
          >
            <UIcon name="i-lucide-plus" class="size-4" />
            Add activity
          </button>
        </div>
      </div>
    </div>

    <!-- Add section button -->
    <div class="flex justify-center">
      <UButton
        label="Add Section"
        icon="i-lucide-plus"
        variant="soft"
        color="neutral"
        size="sm"
        @click="initiateAddSection"
      />
    </div>
  </div>

  <!-- Edit course modal -->
  <UModal v-model:open="showEditModal">
    <template #header>
      <h3 class="text-lg font-semibold">Edit Course</h3>
    </template>
    <template #body>
      <div class="space-y-4">
        <UFormField label="Name" required>
          <UInput
            v-model="editName"
            placeholder="Course name"
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
        <UFormField label="Interface Template">
          <USelect
            v-model="editTemplateId"
            :items="templateOptions"
            value-key="value"
            placeholder="Select a template (optional)"
          />
          <template #hint>
            <NuxtLink to="/templates" class="text-xs text-primary hover:underline">
              Create a new template
            </NuxtLink>
          </template>
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

  <!-- Delete course confirmation -->
  <ConfirmModal
    v-model:open="showDeleteModal"
    title="Delete Course"
    description="Are you sure you want to delete this course? All sections and activities within it will be permanently removed."
    confirm-label="Delete"
    confirm-color="error"
    :loading="deleting"
    @confirm="handleDelete"
  />

  <!-- Name first section modal (when transitioning 1 → 2 sections) -->
  <UModal v-model:open="showNameFirstSectionModal">
    <template #header>
      <h3 class="text-lg font-semibold">Add a Section</h3>
    </template>
    <template #body>
      <div class="space-y-4">
        <p class="text-sm text-muted">
          Adding a second section will organize your course into named groups. Give each section a title.
        </p>
        <UFormField label="First section title">
          <UInput
            v-model="firstSectionTitle"
            placeholder="e.g. Introduction"
            autofocus
          />
        </UFormField>
        <UFormField label="New section title">
          <UInput
            v-model="newSectionTitle"
            placeholder="e.g. Module 2"
            @keydown.enter="handleAddSectionAfterNaming"
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
          @click="showNameFirstSectionModal = false"
        />
        <UButton
          label="Add Section"
          :loading="addingSection"
          @click="handleAddSectionAfterNaming"
        />
      </div>
    </template>
  </UModal>

  <!-- Add section modal (when already multiple sections) -->
  <UModal v-model:open="showAddSectionModal">
    <template #header>
      <h3 class="text-lg font-semibold">Add Section</h3>
    </template>
    <template #body>
      <UFormField label="Section title">
        <UInput
          v-model="newSectionTitle"
          placeholder="e.g. Module 3"
          autofocus
          @keydown.enter="handleAddSection"
        />
      </UFormField>
    </template>
    <template #footer>
      <div class="flex justify-end gap-2">
        <UButton
          label="Cancel"
          color="neutral"
          variant="ghost"
          @click="showAddSectionModal = false"
        />
        <UButton
          label="Add"
          :loading="addingSection"
          @click="handleAddSection"
        />
      </div>
    </template>
  </UModal>

  <!-- Edit section title modal -->
  <UModal v-model:open="showEditSectionModal">
    <template #header>
      <h3 class="text-lg font-semibold">Edit Section</h3>
    </template>
    <template #body>
      <UFormField label="Section title">
        <UInput
          v-model="editSectionTitle"
          placeholder="Section title"
          autofocus
          @keydown.enter="handleSaveSection"
        />
      </UFormField>
    </template>
    <template #footer>
      <div class="flex justify-end gap-2">
        <UButton
          label="Cancel"
          color="neutral"
          variant="ghost"
          @click="showEditSectionModal = false"
        />
        <UButton
          label="Save"
          :loading="savingSection"
          @click="handleSaveSection"
        />
      </div>
    </template>
  </UModal>

  <!-- Delete section confirmation -->
  <ConfirmModal
    v-model:open="showDeleteSectionModal"
    title="Delete Section"
    description="Are you sure you want to delete this section? All activities within it will be permanently removed."
    confirm-label="Delete"
    confirm-color="error"
    :loading="deletingSection"
    @confirm="handleDeleteSection"
  />

  <!-- Add activity modal -->
  <UModal v-model:open="showAddActivityModal">
    <template #header>
      <h3 class="text-lg font-semibold">Add Activity</h3>
    </template>
    <template #body>
      <div class="space-y-4">
        <UFormField label="Activity Template" required>
          <USelect
            v-model="newActivityTemplateId"
            :items="activityTemplateOptions"
            value-key="value"
            placeholder="Select a template"
          />
          <template #hint>
            <NuxtLink to="/templates" class="text-xs text-primary hover:underline">
              Create a new template
            </NuxtLink>
          </template>
        </UFormField>
        <UFormField label="Name" required>
          <UInput
            v-model="newActivityName"
            placeholder="Activity name"
            autofocus
            @keydown.enter="handleAddActivity"
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
          @click="showAddActivityModal = false"
        />
        <UButton
          label="Create"
          :loading="addingActivity"
          :disabled="!newActivityName.trim() || !newActivityTemplateId"
          @click="handleAddActivity"
        />
      </div>
    </template>
  </UModal>

  <!-- Delete activity confirmation -->
  <ConfirmModal
    v-model:open="showDeleteActivityModal"
    title="Delete Activity"
    description="Are you sure you want to delete this activity? All data and conversation history will be permanently removed."
    confirm-label="Delete"
    confirm-color="error"
    :loading="deletingActivity"
    @confirm="handleDeleteActivity"
  />

  <!-- Export dialog -->
  <ExportDialog
    v-if="course"
    v-model:open="showExportDialog"
    :project-id="projectId"
    :course-id="courseId"
    :course-name="course.name"
  />
</template>
