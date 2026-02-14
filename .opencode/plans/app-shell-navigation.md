# Plan: App Shell + Navigation

## Overview
Build the dashboard layout, navigation, project CRUD pages, and composables/API routes. After this the app will look and feel like a real application with established UI patterns.

## Phase 1: Dashboard Layout

### Create `app/layouts/dashboard.vue`
- `UDashboardGroup` wrapping `UDashboardSidebar` + `<slot />`
- Sidebar: `resizable`, `collapsible`
- `#header` slot: `AppLogo` component (full when expanded, icon when collapsed)
- `#default` slot: `UNavigationMenu` (vertical, collapsed-aware) with items:
  - **Projects** (`i-lucide-folder-open`, `/projects`)
  - **Settings** (`i-lucide-settings`, `/settings`)
- `#footer` slot: Color mode toggle via `UColorModeButton`

```vue
<script setup lang="ts">
import type { NavigationMenuItem } from '@nuxt/ui'

const items: NavigationMenuItem[][] = [
  [
    {
      label: 'Projects',
      icon: 'i-lucide-folder-open',
      to: '/projects',
    },
    {
      label: 'Settings',
      icon: 'i-lucide-settings',
      to: '/settings',
    },
  ],
]
</script>

<template>
  <UDashboardGroup>
    <UDashboardSidebar collapsible resizable>
      <template #header="{ collapsed }">
        <AppLogo :collapsed="collapsed" />
      </template>

      <template #default="{ collapsed }">
        <UNavigationMenu
          :collapsed="collapsed"
          :items="items[0]"
          orientation="vertical"
          highlight
        />
      </template>

      <template #footer="{ collapsed }">
        <UColorModeButton v-if="!collapsed" />
        <UColorModeButton v-else />
      </template>
    </UDashboardSidebar>

    <slot />
  </UDashboardGroup>
</template>
```

---

## Phase 2: Complete Project API Routes

### 2.1 `server/api/projects/[id].get.ts` — GET single project

```ts
import { eq } from 'drizzle-orm'
import { projects } from '~~/server/database/schema'

export default defineEventHandler((event) => {
  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Project ID is required' })
  }

  const db = useDb()
  const project = db.select().from(projects).where(eq(projects.id, id)).get()

  if (!project) {
    throw createError({ statusCode: 404, statusMessage: 'Project not found' })
  }

  return project
})
```

### 2.2 `server/api/projects/[id].patch.ts` — Update project

```ts
import { z } from 'zod'
import { eq } from 'drizzle-orm'
import { projects } from '~~/server/database/schema'

const updateProjectSchema = z.object({
  name: z.string().min(1, 'Project name is required').optional(),
  description: z.string().optional(),
})

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Project ID is required' })
  }

  const body = await readBody(event)
  const parsed = updateProjectSchema.parse(body)

  const db = useDb()

  const existing = db.select().from(projects).where(eq(projects.id, id)).get()
  if (!existing) {
    throw createError({ statusCode: 404, statusMessage: 'Project not found' })
  }

  db.update(projects)
    .set({
      ...parsed,
      updatedAt: new Date(),
    })
    .where(eq(projects.id, id))
    .run()

  return db.select().from(projects).where(eq(projects.id, id)).get()
})
```

### 2.3 `server/api/projects/[id].delete.ts` — Delete project

```ts
import { eq } from 'drizzle-orm'
import { projects } from '~~/server/database/schema'

export default defineEventHandler((event) => {
  const id = getRouterParam(event, 'id')
  if (!id) {
    throw createError({ statusCode: 400, statusMessage: 'Project ID is required' })
  }

  const db = useDb()

  const existing = db.select().from(projects).where(eq(projects.id, id)).get()
  if (!existing) {
    throw createError({ statusCode: 404, statusMessage: 'Project not found' })
  }

  db.delete(projects).where(eq(projects.id, id)).run()

  setResponseStatus(event, 204)
  return null
})
```

---

## Phase 3: Composable

### Create `app/composables/useProjects.ts`

```ts
import type { projects } from '~~/server/database/schema'

type Project = typeof projects.$inferSelect

export function useProjects() {
  const { data, pending, error, refresh } = useFetch<Project[]>('/api/projects')

  return { projects: data, pending, error, refresh }
}

export function useProject(id: MaybeRef<string>) {
  const resolvedId = toRef(id)
  const { data, pending, error, refresh } = useFetch<Project>(() => `/api/projects/${resolvedId.value}`)

  return { project: data, pending, error, refresh }
}

export async function createProject(data: { name: string; description?: string }) {
  return $fetch<Project>('/api/projects', {
    method: 'POST',
    body: data,
  })
}

export async function updateProject(id: string, data: { name?: string; description?: string }) {
  return $fetch<Project>(`/api/projects/${id}`, {
    method: 'PATCH',
    body: data,
  })
}

export async function deleteProject(id: string) {
  return $fetch(`/api/projects/${id}`, {
    method: 'DELETE',
  })
}
```

---

## Phase 4: Pages

### 4.1 Update `app/pages/index.vue` — Redirect to /projects

```vue
<script setup lang="ts">
await navigateTo('/projects', { replace: true })
</script>

<template>
  <div />
</template>
```

### 4.2 Create `app/pages/projects/index.vue` — Project list

```vue
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
  } catch (e: any) {
    toast.add({ title: 'Failed to create project', description: e.message, color: 'error' })
  } finally {
    creating.value = false
  }
}
</script>

<template>
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
</template>
```

### 4.3 Create `app/pages/projects/[id].vue` — Project detail

```vue
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
  } catch (e: any) {
    toast.add({ title: 'Failed to update', description: e.message, color: 'error' })
  } finally {
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
  } catch (e: any) {
    toast.add({ title: 'Failed to delete', description: e.message, color: 'error' })
  } finally {
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
</template>
```

### 4.4 Create `app/pages/settings.vue` — Settings stub

```vue
<script setup lang="ts">
definePageMeta({ layout: 'dashboard' })
</script>

<template>
  <UDashboardPanel>
    <template #header>
      <UDashboardNavbar title="Settings">
        <template #leading>
          <UDashboardSidebarCollapse />
        </template>
      </UDashboardNavbar>
    </template>

    <template #body>
      <div class="space-y-6 max-w-2xl">
        <UCard>
          <template #header>
            <div class="flex items-center gap-2">
              <UIcon name="i-lucide-bot" class="size-5" />
              <h3 class="font-semibold">LLM Provider</h3>
            </div>
          </template>
          <p class="text-sm text-muted">
            Configure your LLM provider to enable AI-powered activity generation. Supports Ollama, LM Studio, OpenAI, and Anthropic.
          </p>
          <template #footer>
            <UBadge label="Coming soon" variant="subtle" color="neutral" />
          </template>
        </UCard>

        <UCard>
          <template #header>
            <div class="flex items-center gap-2">
              <UIcon name="i-lucide-database" class="size-5" />
              <h3 class="font-semibold">Data & Storage</h3>
            </div>
          </template>
          <p class="text-sm text-muted">
            All your data is stored locally on this device. No cloud account required.
          </p>
          <template #footer>
            <UBadge label="Coming soon" variant="subtle" color="neutral" />
          </template>
        </UCard>
      </div>
    </template>
  </UDashboardPanel>
</template>
```

---

## Phase 5: Small Components

### 5.1 `app/components/AppLogo.vue`

```vue
<script setup lang="ts">
defineProps<{
  collapsed?: boolean
}>()
</script>

<template>
  <div class="flex items-center gap-2">
    <UIcon name="i-lucide-shapes" class="size-6 text-primary shrink-0" />
    <span v-if="!collapsed" class="font-bold text-lg text-highlighted truncate">
      Playshape
    </span>
  </div>
</template>
```

### 5.2 `app/components/ProjectCard.vue`

```vue
<script setup lang="ts">
defineProps<{
  project: {
    id: string
    name: string
    description: string | null
    createdAt: string | number | Date
    updatedAt: string | number | Date
  }
}>()
</script>

<template>
  <UCard
    as="NuxtLink"
    :to="`/projects/${project.id}`"
    class="hover:ring-primary/50 hover:ring-2 transition-all cursor-pointer"
  >
    <div class="space-y-2">
      <h3 class="font-semibold text-highlighted truncate">
        {{ project.name }}
      </h3>
      <p v-if="project.description" class="text-sm text-muted line-clamp-2">
        {{ project.description }}
      </p>
      <p class="text-xs text-dimmed">
        Created {{ new Date(project.createdAt).toLocaleDateString() }}
      </p>
    </div>
  </UCard>
</template>
```

### 5.3 `app/components/EmptyState.vue`

```vue
<script setup lang="ts">
defineProps<{
  icon?: string
  title: string
  description?: string
}>()
</script>

<template>
  <div class="flex flex-col items-center justify-center py-12 text-center space-y-4">
    <div v-if="icon" class="rounded-full bg-muted/10 p-4">
      <UIcon :name="icon" class="size-8 text-muted" />
    </div>
    <div class="space-y-1">
      <h3 class="text-lg font-medium text-highlighted">{{ title }}</h3>
      <p v-if="description" class="text-sm text-muted max-w-sm">{{ description }}</p>
    </div>
    <slot />
  </div>
</template>
```

### 5.4 `app/components/ConfirmModal.vue`

```vue
<script setup lang="ts">
const props = withDefaults(defineProps<{
  title?: string
  description?: string
  confirmLabel?: string
  confirmColor?: string
  cancelLabel?: string
  loading?: boolean
}>(), {
  title: 'Confirm',
  description: 'Are you sure?',
  confirmLabel: 'Confirm',
  confirmColor: 'error',
  cancelLabel: 'Cancel',
  loading: false,
})

const open = defineModel<boolean>('open', { default: false })
const emit = defineEmits<{
  confirm: []
}>()
</script>

<template>
  <UModal v-model:open="open">
    <template #header>
      <h3 class="text-lg font-semibold">{{ title }}</h3>
    </template>
    <template #body>
      <p class="text-sm text-muted">{{ description }}</p>
    </template>
    <template #footer>
      <div class="flex justify-end gap-2">
        <UButton
          :label="cancelLabel"
          color="neutral"
          variant="ghost"
          @click="open = false"
        />
        <UButton
          :label="confirmLabel"
          :color="confirmColor"
          :loading="loading"
          @click="emit('confirm')"
        />
      </div>
    </template>
  </UModal>
</template>
```

---

## File Summary

| Action | Path |
|--------|------|
| Create | `app/layouts/dashboard.vue` |
| Create | `app/composables/useProjects.ts` |
| Create | `app/pages/projects/index.vue` |
| Create | `app/pages/projects/[id].vue` |
| Create | `app/pages/settings.vue` |
| Create | `app/components/AppLogo.vue` |
| Create | `app/components/ProjectCard.vue` |
| Create | `app/components/EmptyState.vue` |
| Create | `app/components/ConfirmModal.vue` |
| Create | `server/api/projects/[id].get.ts` |
| Create | `server/api/projects/[id].patch.ts` |
| Create | `server/api/projects/[id].delete.ts` |
| Modify | `app/pages/index.vue` (redirect to /projects) |

No new dependencies needed.

## Verification Steps

1. Start dev server: `pnpm dev`
2. Verify redirect: `http://localhost:3200` redirects to `/projects`
3. Verify empty state on project list page
4. Create a project via the modal
5. Verify project card appears in the grid
6. Click into the project detail page
7. Edit the project name and description
8. Delete the project with confirmation
9. Verify sidebar navigation to Settings page
10. Verify sidebar collapse/expand works
11. Verify mobile responsive sidebar toggle
12. Run `pnpm lint` to check for issues
