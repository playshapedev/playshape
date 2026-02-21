<script setup lang="ts">
import type { UIMessage } from 'ai'

defineProps<{
  message: UIMessage
}>()
</script>

<template>
  <!-- Terminal-style message: mono font, user messages have left border + subtle bg -->
  <div
    class="font-mono text-sm min-w-0 break-words overflow-hidden py-1.5"
    :class="message.role === 'user'
      ? 'pl-3 border-l-2 border-primary bg-primary/5'
      : ''"
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
</template>
