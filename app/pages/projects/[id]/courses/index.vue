<script setup lang="ts">
const projectId = inject<string>('projectId')!
const toast = useToast()

const { courses, pending, refresh } = useProjectCourses(projectId)

// ─── Interface templates for the selector ────────────────────────────────────

const { templates: interfaceTemplates } = useTemplates('interface')

const templateOptions = computed(() =>
  (interfaceTemplates.value ?? [])
    .filter(t => t.status === 'published' || t.component)
    .map(t => ({ label: t.name, value: t.id })),
)

// ─── Create course ───────────────────────────────────────────────────────────

const showCreateModal = ref(false)
const newName = ref('')
const newDescription = ref('')
const newTemplateId = ref<string | null>(null)
const creating = ref(false)

function openCreateModal() {
  newName.value = ''
  newDescription.value = ''
  newTemplateId.value = null
  showCreateModal.value = true
}

async function handleCreate() {
  if (!newName.value.trim()) return
  creating.value = true
  try {
    await createCourse(projectId, {
      name: newName.value.trim(),
      description: newDescription.value.trim() || null,
      templateId: newTemplateId.value,
    })
    showCreateModal.value = false
    await refresh()
    toast.add({ title: 'Course created', color: 'success' })
  }
  catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Unknown error'
    toast.add({ title: 'Failed to create course', description: message, color: 'error' })
  }
  finally {
    creating.value = false
  }
}

// ─── Delete course ───────────────────────────────────────────────────────────

const showDeleteModal = ref(false)
const courseToDelete = ref<string | null>(null)
const deleting = ref(false)

function confirmDelete(courseId: string) {
  courseToDelete.value = courseId
  showDeleteModal.value = true
}

async function handleDelete() {
  if (!courseToDelete.value) return
  deleting.value = true
  try {
    await deleteCourse(projectId, courseToDelete.value)
    showDeleteModal.value = false
    courseToDelete.value = null
    await refresh()
    toast.add({ title: 'Course deleted', color: 'success' })
  }
  catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Unknown error'
    toast.add({ title: 'Failed to delete course', description: message, color: 'error' })
  }
  finally {
    deleting.value = false
  }
}
</script>

<template>
  <div class="space-y-4">
    <div class="flex items-center justify-between">
      <h3 class="text-sm font-medium text-muted uppercase tracking-wide">
        Courses
      </h3>
      <UButton
        v-if="courses?.length"
        label="New Course"
        icon="i-lucide-plus"
        size="sm"
        @click="openCreateModal"
      />
    </div>

    <!-- Loading -->
    <div v-if="pending" class="flex items-center justify-center py-8">
      <UIcon name="i-lucide-loader-2" class="size-5 animate-spin text-muted" />
    </div>

    <!-- Empty state -->
    <EmptyState
      v-else-if="!courses?.length"
      icon="i-lucide-book-open"
      title="No courses yet"
      description="Create your first course to start organizing activities into a deliverable learning experience."
    >
      <UButton
        label="Create Course"
        icon="i-lucide-plus"
        @click="openCreateModal"
      />
    </EmptyState>

    <!-- Course list -->
    <div v-else class="grid grid-cols-1 md:grid-cols-2 gap-3">
      <CourseCard
        v-for="course in courses"
        :key="course.id"
        :course="course"
        :project-id="projectId"
        @delete="confirmDelete"
      />
    </div>
  </div>

  <!-- Create course modal -->
  <UModal v-model:open="showCreateModal">
    <template #header>
      <h3 class="text-lg font-semibold">New Course</h3>
    </template>
    <template #body>
      <div class="space-y-4">
        <UFormField label="Name" required>
          <UInput
            v-model="newName"
            placeholder="e.g. Onboarding Module 1"
            autofocus
            @keydown.enter="handleCreate"
          />
        </UFormField>
        <UFormField label="Description">
          <UTextarea
            v-model="newDescription"
            placeholder="Brief description of this course..."
            :rows="3"
          />
        </UFormField>
        <UFormField label="Interface Template">
          <USelect
            v-model="newTemplateId"
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
          @click="showCreateModal = false"
        />
        <UButton
          label="Create"
          :loading="creating"
          :disabled="!newName.trim()"
          @click="handleCreate"
        />
      </div>
    </template>
  </UModal>

  <!-- Delete confirmation -->
  <ConfirmModal
    v-model:open="showDeleteModal"
    title="Delete Course"
    description="Are you sure you want to delete this course? All sections and activities within it will be permanently removed."
    confirm-label="Delete"
    confirm-color="error"
    :loading="deleting"
    @confirm="handleDelete"
  />
</template>
