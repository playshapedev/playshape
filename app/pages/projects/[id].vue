<script setup lang="ts">
definePageMeta({ layout: 'dashboard' })

const route = useRoute()
const router = useRouter()
const toast = useToast()

const projectId = route.params.id as string
const { project, pending, error, refresh } = useProject(projectId)
const { libraries: linkedLibraries, pending: librariesPending, refresh: refreshLinkedLibraries } = useProjectLibraries(projectId)
const { libraries: allLibraries, refresh: refreshAllLibraries } = useLibraries()

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
  { label: 'Libraries', value: 'libraries', icon: 'i-lucide-library-big' },
  { label: 'Skills', value: 'skills', icon: 'i-lucide-target' },
]
const activeTab = ref('overview')

// ─── Library linking ─────────────────────────────────────────────────────────

const showLinkModal = ref(false)
const linking = ref(false)

const linkedIds = computed(() => new Set(linkedLibraries.value?.map(l => l.id) ?? []))

const availableLibraries = computed(() =>
  allLibraries.value?.filter(l => !linkedIds.value.has(l.id)) ?? [],
)

async function handleLink(libraryId: string) {
  linking.value = true
  try {
    await linkLibrary(projectId, libraryId)
    await refreshLinkedLibraries()
    toast.add({ title: 'Library linked', color: 'success' })
  }
  catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Unknown error'
    toast.add({ title: 'Failed to link library', description: message, color: 'error' })
  }
  finally {
    linking.value = false
  }
}

async function handleUnlink(libraryId: string) {
  try {
    await unlinkLibrary(projectId, libraryId)
    await refreshLinkedLibraries()
    toast.add({ title: 'Library unlinked', color: 'success' })
  }
  catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Unknown error'
    toast.add({ title: 'Failed to unlink library', description: message, color: 'error' })
  }
}

function openLinkModal() {
  refreshAllLibraries()
  showLinkModal.value = true
}
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

        <!-- Libraries tab -->
        <div v-else-if="activeTab === 'libraries'" class="space-y-4">
          <div class="flex items-center justify-between">
            <h3 class="text-sm font-medium text-muted uppercase tracking-wide">
              Linked Libraries
            </h3>
            <UButton
              label="Link Library"
              icon="i-lucide-plus"
              size="sm"
              variant="soft"
              @click="openLinkModal"
            />
          </div>

          <div v-if="librariesPending" class="flex items-center justify-center py-8">
            <UIcon name="i-lucide-loader-2" class="size-5 animate-spin text-muted" />
          </div>

          <EmptyState
            v-else-if="!linkedLibraries?.length"
            icon="i-lucide-library-big"
            title="No libraries linked"
            description="Link a library to this project so its content can be used when generating activities."
          >
            <UButton
              label="Link Library"
              icon="i-lucide-plus"
              @click="openLinkModal"
            />
          </EmptyState>

          <div v-else class="space-y-2">
            <div
              v-for="lib in linkedLibraries"
              :key="lib.id"
              class="flex items-center gap-3 p-3 rounded-lg border border-default group"
            >
              <UIcon name="i-lucide-library-big" class="size-5 text-primary shrink-0" />
              <div class="flex-1 min-w-0">
                <NuxtLink
                  :to="`/libraries/${lib.id}`"
                  class="font-medium text-highlighted hover:underline truncate block"
                >
                  {{ lib.name }}
                </NuxtLink>
                <p class="text-xs text-dimmed">
                  {{ lib.documentCount ?? 0 }} {{ (lib.documentCount ?? 0) === 1 ? 'document' : 'documents' }}
                </p>
              </div>
              <UButton
                icon="i-lucide-unlink"
                color="neutral"
                variant="ghost"
                size="xs"
                class="opacity-0 group-hover:opacity-100 transition-opacity"
                @click="handleUnlink(lib.id)"
              />
            </div>
          </div>
        </div>

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
    description="Are you sure you want to delete this project? All activities, skills, and library links will be permanently removed."
    confirm-label="Delete"
    confirm-color="error"
    :loading="deleting"
    @confirm="handleDelete"
  />

  <!-- Link library modal -->
  <UModal v-model:open="showLinkModal">
    <template #header>
      <h3 class="text-lg font-semibold">Link a Library</h3>
    </template>
    <template #body>
      <div v-if="!availableLibraries.length" class="py-4 text-center">
        <p class="text-muted">No more libraries available to link.</p>
        <NuxtLink to="/libraries" class="text-sm text-primary hover:underline mt-2 inline-block">
          Create a new library
        </NuxtLink>
      </div>
      <div v-else class="space-y-2">
        <div
          v-for="lib in availableLibraries"
          :key="lib.id"
          class="flex items-center gap-3 p-3 rounded-lg border border-default hover:border-primary/50 cursor-pointer transition-colors"
          @click="handleLink(lib.id)"
        >
          <UIcon name="i-lucide-library-big" class="size-5 text-muted shrink-0" />
          <div class="flex-1 min-w-0">
            <p class="font-medium text-highlighted truncate">{{ lib.name }}</p>
            <p v-if="lib.description" class="text-xs text-dimmed truncate">{{ lib.description }}</p>
          </div>
          <UIcon name="i-lucide-plus" class="size-4 text-muted shrink-0" />
        </div>
      </div>
    </template>
  </UModal>
  </div>
</template>
