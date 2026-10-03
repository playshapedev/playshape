<script setup lang="ts">
import type { SkillWithDetails } from '~/composables/useSkills'

const projectId = inject<string>('projectId')!
const toast = useToast()

const { skills, pending, refresh } = useProjectSkills(projectId)

function showError(title: string, e: unknown) {
  const message = e instanceof Error ? e.message : 'Unknown error'
  toast.add({ title, description: message, color: 'error' })
}

// ─── Skill create / edit ─────────────────────────────────────────────────────

const showSkillModal = ref(false)
const editingSkillId = ref<string | null>(null)
const skillName = ref('')
const skillDescription = ref('')
const savingSkill = ref(false)

function openCreateSkill() {
  editingSkillId.value = null
  skillName.value = ''
  skillDescription.value = ''
  showSkillModal.value = true
}

function openEditSkill(skill: SkillWithDetails) {
  editingSkillId.value = skill.id
  skillName.value = skill.name
  skillDescription.value = skill.description || ''
  showSkillModal.value = true
}

async function handleSaveSkill() {
  if (!skillName.value.trim()) return
  savingSkill.value = true
  try {
    const data = { name: skillName.value.trim(), description: skillDescription.value.trim() }
    if (editingSkillId.value) {
      await updateSkill(projectId, editingSkillId.value, data)
    }
    else {
      await createSkill(projectId, data)
    }
    showSkillModal.value = false
    await refresh()
    toast.add({ title: editingSkillId.value ? 'Skill updated' : 'Skill created', color: 'success' })
  }
  catch (e: unknown) {
    showError('Failed to save skill', e)
  }
  finally {
    savingSkill.value = false
  }
}

// ─── Skill delete ────────────────────────────────────────────────────────────

const skillToDelete = ref<SkillWithDetails | null>(null)
const showDeleteSkillModal = ref(false)
const deletingSkill = ref(false)

function confirmDeleteSkill(skill: SkillWithDetails) {
  skillToDelete.value = skill
  showDeleteSkillModal.value = true
}

async function handleDeleteSkill() {
  if (!skillToDelete.value) return
  deletingSkill.value = true
  try {
    await deleteSkill(projectId, skillToDelete.value.id)
    showDeleteSkillModal.value = false
    await refresh()
    toast.add({ title: 'Skill deleted', color: 'success' })
  }
  catch (e: unknown) {
    showError('Failed to delete skill', e)
  }
  finally {
    deletingSkill.value = false
  }
}

// ─── Objective create / edit ─────────────────────────────────────────────────

const showObjectiveModal = ref(false)
const objectiveSkillId = ref<string | null>(null)
const editingObjectiveId = ref<string | null>(null)
const objectiveStatement = ref('')
const objectiveConditions = ref('')
const objectiveCriteria = ref('')
const savingObjective = ref(false)

function openCreateObjective(skill: SkillWithDetails) {
  objectiveSkillId.value = skill.id
  editingObjectiveId.value = null
  objectiveStatement.value = ''
  objectiveConditions.value = ''
  objectiveCriteria.value = ''
  showObjectiveModal.value = true
}

function openEditObjective(skill: SkillWithDetails, objective: SkillWithDetails['objectives'][number]) {
  objectiveSkillId.value = skill.id
  editingObjectiveId.value = objective.id
  objectiveStatement.value = objective.statement
  objectiveConditions.value = objective.conditions || ''
  objectiveCriteria.value = objective.criteria || ''
  showObjectiveModal.value = true
}

async function handleSaveObjective() {
  if (!objectiveSkillId.value || !objectiveStatement.value.trim()) return
  savingObjective.value = true
  try {
    const data = {
      statement: objectiveStatement.value.trim(),
      conditions: objectiveConditions.value.trim() || null,
      criteria: objectiveCriteria.value.trim() || null,
    }
    if (editingObjectiveId.value) {
      await updateObjective(projectId, objectiveSkillId.value, editingObjectiveId.value, data)
    }
    else {
      await createObjective(projectId, objectiveSkillId.value, data)
    }
    showObjectiveModal.value = false
    await refresh()
  }
  catch (e: unknown) {
    showError('Failed to save objective', e)
  }
  finally {
    savingObjective.value = false
  }
}

async function handleDeleteObjective(skillId: string, objectiveId: string) {
  try {
    await deleteObjective(projectId, skillId, objectiveId)
    await refresh()
  }
  catch (e: unknown) {
    showError('Failed to delete objective', e)
  }
}
</script>

<template>
  <div class="space-y-4">
    <div class="flex items-center justify-between">
      <h3 class="text-sm font-medium text-muted uppercase tracking-wide">
        Skills
      </h3>
      <UButton
        v-if="skills?.length"
        label="Add Skill"
        icon="i-lucide-plus"
        size="sm"
        variant="soft"
        @click="openCreateSkill"
      />
    </div>

    <div v-if="pending && !skills" class="flex items-center justify-center py-8">
      <UIcon name="i-lucide-loader-2" class="size-5 animate-spin text-muted" />
    </div>

    <EmptyState
      v-else-if="!skills?.length"
      icon="i-lucide-target"
      title="No skills defined"
      description="Define the skills learners should practice in this project, then link activities to them."
    >
      <UButton
        label="Add Skill"
        icon="i-lucide-plus"
        @click="openCreateSkill"
      />
    </EmptyState>

    <div v-else class="space-y-3">
      <div
        v-for="skill in skills"
        :key="skill.id"
        class="rounded-lg border border-default p-4 space-y-3"
      >
        <!-- Skill header -->
        <div class="flex items-start gap-3">
          <UIcon name="i-lucide-target" class="size-5 text-primary shrink-0 mt-0.5" />
          <div class="flex-1 min-w-0">
            <p class="font-medium text-highlighted">{{ skill.name }}</p>
            <p v-if="skill.description" class="text-sm text-muted mt-0.5">{{ skill.description }}</p>
          </div>
          <div class="flex items-center gap-1 shrink-0">
            <UButton
              icon="i-lucide-pencil"
              color="neutral"
              variant="ghost"
              size="xs"
              @click="openEditSkill(skill)"
            />
            <UButton
              icon="i-lucide-trash-2"
              color="error"
              variant="ghost"
              size="xs"
              @click="confirmDeleteSkill(skill)"
            />
          </div>
        </div>

        <!-- Objectives -->
        <div class="pl-8 space-y-2">
          <div class="flex items-center justify-between">
            <p class="text-xs font-medium text-dimmed uppercase tracking-wide">Objectives</p>
            <UButton
              label="Add Objective"
              icon="i-lucide-plus"
              color="neutral"
              variant="ghost"
              size="xs"
              @click="openCreateObjective(skill)"
            />
          </div>

          <p v-if="!skill.objectives.length" class="text-sm text-dimmed">
            No objectives yet. Add measurable objectives to describe what doing this skill well looks like.
          </p>

          <div
            v-for="objective in skill.objectives"
            :key="objective.id"
            class="flex items-start gap-2 group"
          >
            <UIcon name="i-lucide-circle-check" class="size-4 text-muted shrink-0 mt-0.5" />
            <div class="flex-1 min-w-0 text-sm">
              <p class="text-default">{{ objective.statement }}</p>
              <p v-if="objective.conditions" class="text-xs text-muted">
                <span class="font-medium">Given:</span> {{ objective.conditions }}
              </p>
              <p v-if="objective.criteria" class="text-xs text-muted">
                <span class="font-medium">Criteria:</span> {{ objective.criteria }}
              </p>
            </div>
            <div class="flex items-center gap-1 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
              <UButton
                icon="i-lucide-pencil"
                color="neutral"
                variant="ghost"
                size="xs"
                @click="openEditObjective(skill, objective)"
              />
              <UButton
                icon="i-lucide-x"
                color="neutral"
                variant="ghost"
                size="xs"
                @click="handleDeleteObjective(skill.id, objective.id)"
              />
            </div>
          </div>
        </div>

        <!-- Linked activities -->
        <div class="pl-8 space-y-2">
          <p class="text-xs font-medium text-dimmed uppercase tracking-wide">Practiced in</p>
          <p v-if="!skill.activities.length" class="text-sm text-dimmed">
            No activities linked yet. Link this skill from an activity's skills menu.
          </p>
          <div v-else class="flex flex-wrap gap-1.5">
            <NuxtLink
              v-for="activity in skill.activities"
              :key="activity.id"
              :to="`/projects/${projectId}/courses/${activity.courseId}/activities/${activity.id}`"
            >
              <UBadge color="neutral" variant="subtle" class="hover:bg-elevated">
                <UIcon name="i-lucide-puzzle" class="size-3" />
                {{ activity.name }}
                <span class="text-dimmed">· {{ activity.courseName }}</span>
              </UBadge>
            </NuxtLink>
          </div>
        </div>
      </div>
    </div>
  </div>

  <!-- Skill modal -->
  <UModal v-model:open="showSkillModal">
    <template #header>
      <h3 class="text-lg font-semibold">{{ editingSkillId ? 'Edit Skill' : 'New Skill' }}</h3>
    </template>
    <template #body>
      <div class="space-y-4">
        <UFormField label="Name" required help="What should learners be able to do?">
          <UInput
            v-model="skillName"
            placeholder="e.g. De-escalate an upset customer"
            autofocus
            class="w-full"
            @keydown.enter="handleSaveSkill"
          />
        </UFormField>
        <UFormField label="Description">
          <UTextarea
            v-model="skillDescription"
            placeholder="Why this skill matters and where it shows up on the job..."
            :rows="3"
            class="w-full"
          />
        </UFormField>
      </div>
    </template>
    <template #footer>
      <div class="flex justify-end gap-2">
        <UButton label="Cancel" color="neutral" variant="ghost" @click="showSkillModal = false" />
        <UButton
          :label="editingSkillId ? 'Save' : 'Create'"
          :loading="savingSkill"
          :disabled="!skillName.trim()"
          @click="handleSaveSkill"
        />
      </div>
    </template>
  </UModal>

  <!-- Objective modal -->
  <UModal v-model:open="showObjectiveModal">
    <template #header>
      <h3 class="text-lg font-semibold">{{ editingObjectiveId ? 'Edit Objective' : 'New Objective' }}</h3>
    </template>
    <template #body>
      <div class="space-y-4">
        <UFormField label="Performance" required help="The observable action the learner performs.">
          <UTextarea
            v-model="objectiveStatement"
            placeholder="e.g. Acknowledge the customer's frustration and restate their issue"
            :rows="2"
            autofocus
            class="w-full"
          />
        </UFormField>
        <UFormField label="Conditions" help="The situation or tools the learner has.">
          <UInput
            v-model="objectiveConditions"
            placeholder="e.g. Given a live call with an angry customer"
            class="w-full"
          />
        </UFormField>
        <UFormField label="Criteria" help="How you'll know it was done well.">
          <UInput
            v-model="objectiveCriteria"
            placeholder="e.g. Within the first 60 seconds, without interrupting"
            class="w-full"
          />
        </UFormField>
      </div>
    </template>
    <template #footer>
      <div class="flex justify-end gap-2">
        <UButton label="Cancel" color="neutral" variant="ghost" @click="showObjectiveModal = false" />
        <UButton
          :label="editingObjectiveId ? 'Save' : 'Add'"
          :loading="savingObjective"
          :disabled="!objectiveStatement.trim()"
          @click="handleSaveObjective"
        />
      </div>
    </template>
  </UModal>

  <!-- Delete skill confirmation -->
  <ConfirmModal
    v-model:open="showDeleteSkillModal"
    title="Delete Skill"
    :description="`Delete &quot;${skillToDelete?.name}&quot;? Its objectives will be removed and it will be unlinked from all activities.`"
    confirm-label="Delete"
    confirm-color="error"
    :loading="deletingSkill"
    @confirm="handleDeleteSkill"
  />
</template>
