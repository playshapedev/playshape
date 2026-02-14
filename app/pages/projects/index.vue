<script setup lang="ts">
definePageMeta({ layout: 'dashboard' })

const { projects, pending, refresh } = useProjects()

const showCreateModal = ref(false)
const newProjectName = ref('')
const newProjectDescription = ref('')
const creating = ref(false)

const toast = useToast()

async function handleCreate() {
  if (!newProjectName.value.trim()) return
  creating.value = true
  try {
    await createProject({
      name: newProjectName.value.trim(),
      description: newProjectDescription.value.trim(),
    })
    showCreateModal.value = false
    newProjectName.value = ''
    newProjectDescription.value = ''
    await refresh()
    toast.add({ title: 'Project created', color: 'success' })
  }
  catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Unknown error'
    toast.add({ title: 'Failed to create project', description: message, color: 'error' })
  }
  finally {
    creating.value = false
  }
}
</script>

<template>
  <div class="flex flex-1 min-w-0">
  <UDashboardPanel>
    <template #header>
      <UDashboardNavbar title="Projects">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
        <template #right>
          <UButton
            label="New Project"
            icon="i-lucide-plus"
            @click="showCreateModal = true"
          />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <!-- Loading -->
      <div v-if="pending" class="flex items-center justify-center py-12">
        <UIcon name="i-lucide-loader-2" class="size-6 animate-spin text-muted" />
      </div>

      <!-- Empty state -->
      <EmptyState
        v-else-if="!projects?.length"
        icon="i-lucide-folder-open"
        title="No projects yet"
        description="Create your first project to start building practice activities."
      >
        <UButton
          label="Create Project"
          icon="i-lucide-plus"
          @click="showCreateModal = true"
        />
      </EmptyState>

      <!-- Project grid -->
      <div v-else class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        <ProjectCard
          v-for="project in projects"
          :key="project.id"
          :project="project"
        />
      </div>
    </template>
  </UDashboardPanel>

  <!-- Create modal -->
  <UModal v-model:open="showCreateModal">
    <template #header>
      <h3 class="text-lg font-semibold">New Project</h3>
    </template>
    <template #body>
      <div class="space-y-4">
        <UFormField label="Name" required>
          <UInput
            v-model="newProjectName"
            placeholder="e.g. Customer Service Training"
            autofocus
            @keydown.enter="handleCreate"
          />
        </UFormField>
        <UFormField label="Description">
          <UTextarea
            v-model="newProjectDescription"
            placeholder="Brief description of this project..."
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
          @click="showCreateModal = false"
        />
        <UButton
          label="Create"
          :loading="creating"
          :disabled="!newProjectName.trim()"
          @click="handleCreate"
        />
      </div>
    </template>
  </UModal>
  </div>
</template>
