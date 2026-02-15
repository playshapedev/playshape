<script setup lang="ts">
import { z } from 'zod'
import type { LLMProvider, LLMProviderType, ModelInfo } from '~/composables/useLLMProviders'

const props = defineProps<{
  provider?: LLMProvider | null
}>()

const emit = defineEmits<{
  submit: [data: {
    name: string
    type: LLMProviderType
    baseUrl: string | null
    apiKey: string | null
    model: string
  }]
  cancel: []
}>()

const isEditing = computed(() => !!props.provider)

const providerTypeOptions = Object.entries(PROVIDER_TYPES).map(([value, meta]) => ({
  label: meta.label,
  value,
  icon: meta.icon,
}))

// ─── Form State ──────────────────────────────────────────────────────────────

const schema = z.object({
  type: z.enum(['ollama', 'lmstudio', 'openai', 'anthropic', 'fireworks']),
  baseUrl: z.string().url('Must be a valid URL').optional().or(z.literal('')),
  apiKey: z.string().optional().or(z.literal('')),
  model: z.string().min(1, 'Model is required'),
})

type FormState = {
  type: LLMProviderType
  baseUrl: string
  apiKey: string
  model: string
}

const state = reactive<FormState>({
  type: (props.provider?.type as LLMProviderType) ?? 'ollama',
  baseUrl: props.provider?.baseUrl ?? PROVIDER_TYPES.ollama.defaultBaseUrl ?? '',
  apiKey: props.provider?.apiKey ?? '',
  model: props.provider?.model ?? '',
})

const currentMeta = computed(() => PROVIDER_TYPES[state.type])

// When provider type changes, update defaults, clear fields, and fetch models
watch(() => state.type, (newType) => {
  const meta = PROVIDER_TYPES[newType]
  state.baseUrl = meta.defaultBaseUrl ?? ''
  state.apiKey = ''
  state.model = ''
  availableModels.value = []
  fetchModels()
})

// ─── Model Discovery ─────────────────────────────────────────────────────────

const availableModels = ref<ModelInfo[]>([])
const fetchingModels = ref(false)
const modelError = ref('')

const modelItems = computed(() =>
  availableModels.value.map(m => ({
    label: m.description ? `${m.name} — ${m.description}` : m.name,
    value: m.id,
  })),
)

async function fetchModels() {
  fetchingModels.value = true
  modelError.value = ''

  try {
    const models = await discoverModels({
      type: state.type,
      baseUrl: state.baseUrl || null,
      apiKey: state.apiKey || null,
    })
    availableModels.value = models
  }
  catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error)
    if (error && typeof error === 'object' && 'data' in error) {
      const data = (error as { data?: { message?: string } }).data
      modelError.value = data?.message || message
    }
    else {
      modelError.value = message
    }
  }
  finally {
    fetchingModels.value = false
  }
}

// Auto-fetch models on mount
onMounted(() => {
  fetchModels()
})

// ─── Connection Testing ──────────────────────────────────────────────────────

const testing = ref(false)
const testStatus = ref<'idle' | 'success' | 'error'>('idle')
const testMessage = ref('')

async function runTest() {
  if (!state.model) return

  testing.value = true
  testStatus.value = 'idle'
  testMessage.value = ''

  try {
    const result = await testLLMProvider({
      type: state.type,
      baseUrl: state.baseUrl || null,
      apiKey: state.apiKey || null,
      model: state.model,
    })
    testStatus.value = 'success'
    testMessage.value = result.response ? `Model responded: "${result.response}"` : 'Connection successful'
  }
  catch (error: unknown) {
    testStatus.value = 'error'
    if (error && typeof error === 'object' && 'data' in error) {
      const data = (error as { data?: { message?: string } }).data
      testMessage.value = data?.message || 'Connection test failed'
    }
    else {
      testMessage.value = error instanceof Error ? error.message : 'Connection test failed'
    }
  }
  finally {
    testing.value = false
  }
}

// ─── Submit ──────────────────────────────────────────────────────────────────

function onSubmit() {
  emit('submit', {
    name: currentMeta.value.label,
    type: state.type,
    baseUrl: currentMeta.value.needsBaseUrl ? (state.baseUrl || null) : null,
    apiKey: currentMeta.value.needsApiKey ? (state.apiKey || null) : null,
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

    <!-- Base URL (local providers only) -->
    <UFormField
      v-if="currentMeta.needsBaseUrl"
      name="baseUrl"
      label="Server URL"
      :description="`Default: ${currentMeta.defaultBaseUrl}`"
    >
      <div class="flex gap-2">
        <UInput v-model="state.baseUrl" :placeholder="currentMeta.defaultBaseUrl ?? ''" class="flex-1" />
        <UButton
          icon="i-lucide-refresh-cw"
          variant="outline"
          color="neutral"
          :loading="fetchingModels"
          @click="fetchModels"
        >
          Refresh
        </UButton>
      </div>
    </UFormField>

    <!-- API Key (cloud providers only) -->
    <UFormField
      v-if="currentMeta.needsApiKey"
      name="apiKey"
      label="API Key"
      description="Stored locally on this device only."
    >
      <div class="flex gap-2">
        <UInput v-model="state.apiKey" type="password" placeholder="sk-..." class="flex-1" />
        <UButton
          icon="i-lucide-refresh-cw"
          variant="outline"
          color="neutral"
          :loading="fetchingModels"
          @click="fetchModels"
        >
          Fetch Models
        </UButton>
      </div>
    </UFormField>

    <!-- Model -->
    <UFormField name="model" label="Model" required>
      <USelectMenu
        v-model="state.model"
        :items="modelItems"
        value-key="value"
        :placeholder="fetchingModels ? 'Loading models...' : 'Select a model'"
        :disabled="fetchingModels"
        searchable
      />
      <template v-if="modelError" #error>
        {{ modelError }}
      </template>
    </UFormField>

    <!-- Test Connection -->
    <div v-if="state.model" class="flex items-center gap-3">
      <UButton
        icon="i-lucide-activity"
        variant="soft"
        color="neutral"
        :loading="testing"
        @click="runTest"
      >
        Test Connection
      </UButton>
      <div v-if="testStatus !== 'idle'" class="flex items-center gap-1.5 text-sm">
        <UIcon
          :name="testStatus === 'success' ? 'i-lucide-check-circle' : 'i-lucide-x-circle'"
          :class="testStatus === 'success' ? 'text-success' : 'text-error'"
          class="size-4"
        />
        <span :class="testStatus === 'success' ? 'text-success' : 'text-error'">
          {{ testMessage }}
        </span>
      </div>
    </div>

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
