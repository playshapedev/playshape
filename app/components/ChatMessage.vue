<script setup lang="ts">
import type { UIMessage } from 'ai'

defineProps<{
  message: UIMessage
}>()
</script>

<template>
  <div
    class="flex gap-2"
    :class="message.role === 'user' ? 'justify-end' : 'justify-start'"
  >
    <!-- Avatar -->
    <div v-if="message.role === 'assistant'" class="shrink-0">
      <div class="size-7 rounded-full bg-primary/10 flex items-center justify-center">
        <UIcon name="i-lucide-sparkles" class="size-4 text-primary" />
      </div>
    </div>

    <!-- Content -->
    <div
      class="max-w-[85%] min-w-0 rounded-lg px-3 py-2 text-sm break-words overflow-hidden"
      :class="message.role === 'user'
        ? 'bg-primary text-white'
        : 'bg-elevated'"
    >
      <template v-for="(part, i) in message.parts" :key="i">
        <!-- Text -->
        <p v-if="part.type === 'text'" class="whitespace-pre-wrap">{{ part.text }}</p>

        <!-- Template update/patch: in progress -->
        <div
          v-else-if="(part.type === 'tool-update_template' || part.type === 'tool-patch_component') && 'state' in part && ((part as any).state === 'input-available' || (part as any).state === 'input-streaming')"
          class="flex items-center gap-1.5 text-xs text-muted mt-1"
        >
          <UIcon name="i-lucide-loader-2" class="size-3.5 animate-spin" />
          {{ part.type === 'tool-patch_component' ? 'Patching component...' : 'Updating template...' }}
        </div>

        <!-- Template update/patch: complete -->
        <div
          v-else-if="(part.type === 'tool-update_template' || part.type === 'tool-patch_component') && 'state' in part && (part as any).state === 'output-available'"
          class="flex items-center gap-1.5 text-xs text-muted mt-1"
        >
          <UIcon
            :name="(part as any).output?.success === false ? 'i-lucide-alert-circle' : 'i-lucide-check-circle'"
            :class="(part as any).output?.success === false ? 'size-3.5 text-warning' : 'size-3.5 text-success'"
          />
          {{ (part as any).output?.success === false ? 'Patch failed — retrying...' : 'Template updated' }}
        </div>

        <!-- ask_question is rendered by the parent TemplateChat component as buttons -->
        <!-- Step boundaries are ignored in rendering -->
      </template>
    </div>
  </div>
</template>
