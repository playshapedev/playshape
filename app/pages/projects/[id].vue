<script setup lang="ts">
definePageMeta({ layout: 'dashboard' })

const route = useRoute()
const router = useRouter()
const toast = useToast()
const { setTitle } = useNavbar()

const projectId = route.params.id as string
const { project, pending, error, refresh } = useProject(projectId)

// Only show project-level actions on direct tab pages, not deeper sub-routes
// (e.g. hide when viewing a course detail at /projects/:id/courses/:courseId)
const isDirectTabPage = computed(() => {
  const segments = route.path.replace(/\/$/, '').split('/')
  // /projects/:id = 3 segments, /projects/:id/courses = 4, /projects/:id/courses/:courseId = 5
  return segments.length <= 4
})

// Set dynamic navbar title from project name.
// Re-set on route change so title restores after sub-pages (e.g. course detail)
// override it, then the user navigates back to a direct tab page.
watch([() => project.value?.name, isDirectTabPage], ([name, isDirect]) => {
  if (name && isDirect) setTitle(name)
}, { immediate: true })

// ─── Provide project data to child tab pages ─────────────────────────────────

provide('project', { project, pending, error, refresh })
provide('projectId', projectId)

// ─── Delete ──────────────────────────────────────────────────────────────────

const showDeleteModal = ref(false)
const deleting = ref(false)

async function handleDelete() {
  if (!project.value) return
  deleting.value = true
  try {
    await deleteProject(project.value.id)
    toast.add({ title: 'Project deleted', color: 'success' })
    await router.push('/projects')
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
  if (!project.value) return
  editName.value = project.value.name
  editDescription.value = project.value.description || ''
  showEditModal.value = true
}

async function handleSave() {
  if (!project.value || !editName.value.trim()) return
  saving.value = true
  try {
    await updateProject(project.value.id, {
      name: editName.value.trim(),
      description: editDescription.value.trim(),
    })
    showEditModal.value = false
    await refresh()
    toast.add({ title: 'Project updated', color: 'success' })
  }
  catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Unknown error'
    toast.add({ title: 'Failed to update', description: message, color: 'error' })
  }
  finally {
    saving.value = false
  }
}
</script>

<template>
  <!-- Navbar actions (only on direct tab pages, not sub-routes like course detail) -->
  <Teleport v-if="isDirectTabPage" defer to="#navbar-actions">
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
    title="Project not found"
    description="This project doesn't exist or has been deleted."
  >
    <UButton label="Back to Projects" to="/projects" />
  </EmptyState>

  <!-- Project content: child tab pages render here -->
  <NuxtPage v-else-if="project" />

  <!-- Edit modal -->
  <UModal v-model:open="showEditModal">
    <template #header>
      <h3 class="text-lg font-semibold">Edit Project</h3>
    </template>
    <template #body>
      <div class="space-y-4">
        <UFormField label="Name" required>
          <UInput
            v-model="editName"
            placeholder="Project name"
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

  <!-- Delete confirmation -->
  <ConfirmModal
    v-model:open="showDeleteModal"
    title="Delete Project"
    description="Are you sure you want to delete this project? All courses, skills, and library links will be permanently removed."
    confirm-label="Delete"
    confirm-color="error"
    :loading="deleting"
    @confirm="handleDelete"
  />
</template>
