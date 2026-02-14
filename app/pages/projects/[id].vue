<script setup lang="ts">
definePageMeta({ layout: 'dashboard' })

const route = useRoute()
const router = useRouter()
const toast = useToast()

const { project, pending, error, refresh } = useProject(route.params.id as string)

const showDeleteModal = ref(false)
const deleting = ref(false)

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

const tabs = [
  { label: 'Overview', value: 'overview', icon: 'i-lucide-layout-dashboard' },
  { label: 'Activities', value: 'activities', icon: 'i-lucide-play-circle' },
  { label: 'Content', value: 'content', icon: 'i-lucide-file-text' },
  { label: 'Skills', value: 'skills', icon: 'i-lucide-target' },
]
const activeTab = ref('overview')
</script>

<template>
  <div class="flex flex-1 min-w-0">
  <UDashboardPanel>
    <template #header>
      <UDashboardNavbar :title="project?.name || 'Loading...'">
        <template #leading>
          <UDashboardSidebarCollapse />
          <UButton
            icon="i-lucide-arrow-left"
            color="neutral"
            variant="ghost"
            size="sm"
            to="/projects"
          />
        </template>
        <template #right>
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
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
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

      <!-- Project content -->
      <div v-else-if="project" class="space-y-6">
        <!-- Description -->
        <p v-if="project.description" class="text-muted">
          {{ project.description }}
        </p>

        <!-- Tabs -->
        <UTabs v-model="activeTab" :items="tabs" />

        <!-- Overview tab -->
        <div v-if="activeTab === 'overview'" class="space-y-4">
          <UCard>
            <div class="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span class="text-muted">Created</span>
                <p class="font-medium">{{ new Date(project.createdAt).toLocaleDateString() }}</p>
              </div>
              <div>
                <span class="text-muted">Last Updated</span>
                <p class="font-medium">{{ new Date(project.updatedAt).toLocaleDateString() }}</p>
              </div>
            </div>
          </UCard>
        </div>

        <!-- Activities tab -->
        <EmptyState
          v-else-if="activeTab === 'activities'"
          icon="i-lucide-play-circle"
          title="No activities yet"
          description="Activities will appear here once you create them."
        />

        <!-- Content tab -->
        <EmptyState
          v-else-if="activeTab === 'content'"
          icon="i-lucide-file-text"
          title="No content yet"
          description="Upload content to use for generating practice activities."
        />

        <!-- Skills tab -->
        <EmptyState
          v-else-if="activeTab === 'skills'"
          icon="i-lucide-target"
          title="No skills defined"
          description="Define the skills learners should practice in this project."
        />
      </div>
    </template>
  </UDashboardPanel>

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
    description="Are you sure you want to delete this project? All activities, content, and skills will be permanently removed."
    confirm-label="Delete"
    confirm-color="error"
    :loading="deleting"
    @confirm="handleDelete"
  />
  </div>
</template>
