<script setup lang="ts">
import { z } from 'zod'
import type { ImageProvider, ImageProviderType } from '~/composables/useImageProviders'

const props = defineProps<{
  provider?: ImageProvider | null
}>()

const emit = defineEmits<{
  submit: [data: {
    name: string
    type: ImageProviderType
    apiKey: string | null
    model: string
  }]
  cancel: []
}>()

const isEditing = computed(() => !!props.provider)

const providerTypeOptions = Object.entries(IMAGE_PROVIDER_TYPES).map(([value, meta]) => ({
  label: meta.label,
  value,
  icon: meta.icon,
}))

// ─── Form State ──────────────────────────────────────────────────────────────

const schema = z.object({
  type: z.enum(['openai', 'replicate', 'fal', 'fireworks']),
  apiKey: z.string().min(1, 'API key is required'),
  model: z.string().min(1, 'Model is required'),
})

type FormState = {
  type: ImageProviderType
  apiKey: string
  model: string
}

const state = reactive<FormState>({
  type: (props.provider?.type as ImageProviderType) ?? 'openai',
  apiKey: props.provider?.apiKey ?? '',
  model: props.provider?.model ?? '',
})

const currentMeta = computed(() => IMAGE_PROVIDER_TYPES[state.type])

// Model options for the current provider type
const modelItems = computed(() =>
  currentMeta.value.defaultModels.map(m => ({
    label: m.description ? `${m.name} — ${m.description}` : m.name,
    value: m.id,
  })),
)

// When provider type changes, reset model selection
watch(() => state.type, () => {
  state.model = ''
})

// ─── Submit ──────────────────────────────────────────────────────────────────

function onSubmit() {
  emit('submit', {
    name: currentMeta.value.label,
    type: state.type,
    apiKey: state.apiKey || null,
    model: state.model,
  })
}
</script>

<template>
  <UForm :schema="schema" :state="state" @submit="onSubmit" class="space-y-5">
    <!-- Provider Type -->
    <UFormField name="type" label="Provider" required>
      <USelect
        v-model="state.type"
        :items="providerTypeOptions"
        value-key="value"
      />
    </UFormField>

    <!-- API Key -->
    <UFormField
      name="apiKey"
      label="API Key"
      description="Stored locally on this device only."
      required
    >
      <UInput v-model="state.apiKey" type="password" placeholder="sk-..." />
    </UFormField>

    <!-- Model -->
    <UFormField name="model" label="Model" required>
      <USelectMenu
        v-model="state.model"
        :items="modelItems"
        value-key="value"
        placeholder="Select a model"
        searchable
      />
    </UFormField>

    <!-- Actions -->
    <div class="flex justify-end gap-2 pt-2">
      <UButton variant="ghost" color="neutral" @click="emit('cancel')">
        Cancel
      </UButton>
      <UButton type="submit">
        {{ isEditing ? 'Save Changes' : 'Add Provider' }}
      </UButton>
    </div>
  </UForm>
</template>
