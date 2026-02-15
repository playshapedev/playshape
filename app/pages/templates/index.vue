<script setup lang="ts">
definePageMeta({ layout: 'dashboard' })

const { templates, pending, refresh } = useTemplates()

const showCreateModal = ref(false)
const newTemplateName = ref('')
const newTemplateDescription = ref('')
const creating = ref(false)

const toast = useToast()
const router = useRouter()

async function handleCreate() {
  if (!newTemplateName.value.trim()) return
  creating.value = true
  try {
    const template = await createTemplate({
      name: newTemplateName.value.trim(),
      description: newTemplateDescription.value.trim(),
    })
    showCreateModal.value = false
    newTemplateName.value = ''
    newTemplateDescription.value = ''
    toast.add({ title: 'Template created', color: 'success' })
    // Navigate to the editor immediately
    await router.push(`/templates/${template.id}`)
  }
  catch (e: unknown) {
    const message = e instanceof Error ? e.message : 'Unknown error'
    toast.add({ title: 'Failed to create template', description: message, color: 'error' })
  }
  finally {
    creating.value = false
  }
}
</script>

<template>
  <!-- Navbar actions -->
  <Teleport defer to="#navbar-actions">
    <UButton
      label="New Template"
      icon="i-lucide-plus"
      @click="showCreateModal = true"
    />
  </Teleport>

  <!-- Loading -->
  <div v-if="pending" class="flex items-center justify-center py-12">
    <UIcon name="i-lucide-loader-2" class="size-6 animate-spin text-muted" />
  </div>

  <!-- Empty state -->
  <EmptyState
    v-else-if="!templates?.length"
    icon="i-lucide-layout-template"
    title="No templates yet"
    description="Create reusable activity templates powered by AI conversation."
  >
    <UButton
      label="Create Template"
      icon="i-lucide-plus"
      @click="showCreateModal = true"
    />
  </EmptyState>

  <!-- Template grid -->
  <div v-else class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
    <TemplateCard
      v-for="tmpl in templates"
      :key="tmpl.id"
      :template="tmpl"
    />
  </div>

  <!-- Create modal -->
  <UModal v-model:open="showCreateModal">
    <template #header>
      <h3 class="text-lg font-semibold">New Template</h3>
    </template>
    <template #body>
      <div class="space-y-4">
        <UFormField label="Name" required>
          <UInput
            v-model="newTemplateName"
            placeholder="e.g. Branching Scenario"
            autofocus
            @keydown.enter="handleCreate"
          />
        </UFormField>
        <UFormField label="Description">
          <UTextarea
            v-model="newTemplateDescription"
            placeholder="Brief description of this template..."
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
          :disabled="!newTemplateName.trim()"
          @click="handleCreate"
        />
      </div>
    </template>
  </UModal>
</template>
