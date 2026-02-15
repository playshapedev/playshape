<script setup lang="ts">
interface InputField {
  id: string
  type: string
  label: string
  required?: boolean
  placeholder?: string
  options?: string[]
  default?: unknown
  min?: number
  max?: number
  fields?: InputField[]
}

const props = defineProps<{
  fields: InputField[]
  modelValue: Record<string, unknown>
  /** Nesting depth for visual indentation (used internally for recursion) */
  depth?: number
}>()

const emit = defineEmits<{
  'update:modelValue': [value: Record<string, unknown>]
}>()

const currentDepth = computed(() => props.depth ?? 0)

function updateField(fieldId: string, value: unknown) {
  emit('update:modelValue', { ...props.modelValue, [fieldId]: value })
}

// ─── Array field helpers ─────────────────────────────────────────────────────

function getArrayItems(fieldId: string): Record<string, unknown>[] {
  const val = props.modelValue[fieldId]
  return Array.isArray(val) ? val : []
}

function updateArrayItem(fieldId: string, index: number, item: Record<string, unknown>) {
  const items = [...getArrayItems(fieldId)]
  items[index] = item
  updateField(fieldId, items)
}

function addArrayItem(field: InputField) {
  const items = [...getArrayItems(field.id)]
  // Create a blank item from the sub-field definitions
  const blank: Record<string, unknown> = {}
  for (const sub of (field.fields || [])) {
    blank[sub.id] = sub.type === 'checkbox' ? false
      : sub.type === 'number' ? 0
        : sub.type === 'color' ? '#000000'
          : sub.type === 'array' ? []
            : ''
  }
  items.push(blank)
  updateField(field.id, items)
}

function removeArrayItem(fieldId: string, index: number) {
  const items = [...getArrayItems(fieldId)]
  items.splice(index, 1)
  updateField(fieldId, items)
}

function moveArrayItem(fieldId: string, from: number, to: number) {
  const items = [...getArrayItems(fieldId)]
  if (to < 0 || to >= items.length) return
  const [item] = items.splice(from, 1)
  items.splice(to, 0, item!)
  updateField(fieldId, items)
}

// ─── Collapse state ──────────────────────────────────────────────────────────

/** Group-level collapse: hides all items under an array field */
const collapsedGroups = reactive(new Set<string>())

function isGroupCollapsed(fieldId: string) {
  return collapsedGroups.has(fieldId)
}

function toggleGroupCollapse(fieldId: string) {
  if (collapsedGroups.has(fieldId)) {
    collapsedGroups.delete(fieldId)
  }
  else {
    collapsedGroups.add(fieldId)
  }
}

/** Individual item collapse */
const collapsed = reactive(new Set<string>())

function itemKey(fieldId: string, index: number) {
  return `${fieldId}-${index}`
}

function isCollapsed(fieldId: string, index: number) {
  return collapsed.has(itemKey(fieldId, index))
}

function toggleCollapse(fieldId: string, index: number) {
  const key = itemKey(fieldId, index)
  if (collapsed.has(key)) {
    collapsed.delete(key)
  }
  else {
    collapsed.add(key)
  }
}

/**
 * Get a short summary of an array item for display when collapsed.
 * Uses the first text/textarea sub-field value, or falls back to "Item N".
 */
function itemSummary(field: InputField, item: Record<string, unknown>, index: number): string {
  if (!field.fields) return `${index + 1}`
  for (const sub of field.fields) {
    if ((sub.type === 'text' || sub.type === 'textarea') && item[sub.id]) {
      const val = String(item[sub.id])
      return val.length > 40 ? val.slice(0, 40) + '...' : val
    }
  }
  return `${field.label.replace(/s$/, '')} ${index + 1}`
}
</script>

<template>
  <div class="space-y-4">
    <p v-if="!fields.length" class="text-sm text-muted">
      No input fields defined yet. Continue the conversation to generate a template.
    </p>

    <template v-for="field in fields" :key="field.id">
      <!-- ─── Array field ─────────────────────────────────────────── -->
      <div v-if="field.type === 'array' && field.fields?.length" class="space-y-3">
        <div class="flex items-center justify-between">
          <button
            type="button"
            class="flex items-center gap-1.5 text-sm font-medium cursor-pointer hover:text-highlighted transition-colors"
            @click="toggleGroupCollapse(field.id)"
          >
            <UIcon
              :name="isGroupCollapsed(field.id) ? 'i-lucide-chevron-right' : 'i-lucide-chevron-down'"
              class="size-3.5 text-muted shrink-0"
            />
            {{ field.label }}
            <span v-if="getArrayItems(field.id).length" class="text-xs text-muted font-normal">({{ getArrayItems(field.id).length }})</span>
          </button>
          <UButton
            icon="i-lucide-plus"
            size="xs"
            variant="soft"
            color="neutral"
            :label="`Add ${field.label.replace(/s$/, '')}`"
            @click="addArrayItem(field)"
          />
        </div>

        <!-- Empty state -->
        <p v-if="!getArrayItems(field.id).length" class="text-xs text-muted pl-3 border-l-2 border-default py-2">
          No items yet. Click "Add" to create one.
        </p>

        <!-- Items (hidden when group is collapsed) -->
        <div
          v-for="(item, index) in getArrayItems(field.id)"
          v-show="!isGroupCollapsed(field.id)"
          :key="index"
          class="border border-default rounded-lg"
        >
          <!-- Item header -->
          <div class="flex items-center bg-elevated/50 rounded-t-lg" :class="!isCollapsed(field.id, index) && 'border-b border-default'">
            <button
              type="button"
              class="flex items-center gap-1.5 flex-1 min-w-0 px-3 py-2 text-left cursor-pointer hover:bg-elevated/80 rounded-tl-lg transition-colors"
              :class="isCollapsed(field.id, index) && 'rounded-bl-lg'"
              @click="toggleCollapse(field.id, index)"
            >
              <UIcon
                :name="isCollapsed(field.id, index) ? 'i-lucide-chevron-right' : 'i-lucide-chevron-down'"
                class="size-3.5 text-muted shrink-0"
              />
              <span class="text-xs font-medium text-muted truncate">{{ itemSummary(field, item as Record<string, unknown>, index) }}</span>
            </button>
            <div class="flex items-center gap-0.5 px-2 shrink-0">
              <UButton
                icon="i-lucide-chevron-up"
                size="xs"
                variant="ghost"
                color="neutral"
                :disabled="index === 0"
                @click="moveArrayItem(field.id, index, index - 1)"
              />
              <UButton
                icon="i-lucide-chevron-down"
                size="xs"
                variant="ghost"
                color="neutral"
                :disabled="index === getArrayItems(field.id).length - 1"
                @click="moveArrayItem(field.id, index, index + 1)"
              />
              <UButton
                icon="i-lucide-trash-2"
                size="xs"
                variant="ghost"
                color="error"
                @click="removeArrayItem(field.id, index)"
              />
            </div>
          </div>

          <!-- Item fields (recursive, collapsible) -->
          <div v-show="!isCollapsed(field.id, index)" class="p-3">
            <TemplateDataForm
              :fields="field.fields!"
              :model-value="(item as Record<string, unknown>)"
              :depth="currentDepth + 1"
              @update:model-value="updateArrayItem(field.id, index, $event)"
            />
          </div>
        </div>
      </div>

      <!-- ─── Scalar fields ───────────────────────────────────────── -->
      <UFormField
        v-else
        :label="field.label"
        :required="field.required"
      >
        <!-- Text -->
        <UInput
          v-if="field.type === 'text'"
          :model-value="String(modelValue[field.id] ?? '')"
          :placeholder="field.placeholder"
          @update:model-value="updateField(field.id, $event)"
        />

        <!-- Textarea -->
        <UTextarea
          v-else-if="field.type === 'textarea'"
          :model-value="String(modelValue[field.id] ?? '')"
          :placeholder="field.placeholder"
          :rows="4"
          @update:model-value="updateField(field.id, $event)"
        />

        <!-- Dropdown -->
        <USelect
          v-else-if="field.type === 'dropdown'"
          :model-value="String(modelValue[field.id] ?? '')"
          :items="(field.options || []).map((o: string) => ({ label: o, value: o }))"
          @update:model-value="updateField(field.id, $event)"
        />

        <!-- Checkbox -->
        <UCheckbox
          v-else-if="field.type === 'checkbox'"
          :model-value="Boolean(modelValue[field.id])"
          :label="field.label"
          @update:model-value="updateField(field.id, $event)"
        />

        <!-- Number -->
        <UInput
          v-else-if="field.type === 'number'"
          type="number"
          :model-value="String(modelValue[field.id] ?? 0)"
          :min="field.min"
          :max="field.max"
          @update:model-value="updateField(field.id, Number($event))"
        />

        <!-- Color -->
        <div v-else-if="field.type === 'color'" class="flex items-center gap-2">
          <input
            type="color"
            :value="String(modelValue[field.id] ?? '#000000')"
            class="size-9 rounded cursor-pointer border border-default"
            @input="updateField(field.id, ($event.target as HTMLInputElement).value)"
          >
          <UInput
            :model-value="String(modelValue[field.id] ?? '#000000')"
            class="flex-1"
            @update:model-value="updateField(field.id, $event)"
          />
        </div>

        <!-- Fallback: text input -->
        <UInput
          v-else
          :model-value="String(modelValue[field.id] ?? '')"
          :placeholder="field.placeholder"
          @update:model-value="updateField(field.id, $event)"
        />
      </UFormField>
    </template>
  </div>
</template>
