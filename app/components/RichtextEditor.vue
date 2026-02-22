<script setup lang="ts">
import type { EditorToolbarItem } from '@nuxt/ui'

/**
 * A minimal rich text editor for textarea fields.
 * Uses Nuxt UI's UEditor with a bubble toolbar (appears on text selection).
 * Outputs markdown content.
 */
const props = defineProps<{
  modelValue: string
  placeholder?: string
}>()

const emit = defineEmits<{
  'update:modelValue': [value: string]
}>()

// Local state for the editor
const content = ref(props.modelValue || '')

// Sync from parent to editor (but avoid loops)
let skipNextWatch = false
watch(() => props.modelValue, (val) => {
  if (skipNextWatch) {
    skipNextWatch = false
    return
  }
  content.value = val || ''
})

// Sync from editor to parent
watch(content, (val) => {
  skipNextWatch = true
  emit('update:modelValue', val)
})

// Bubble toolbar items - basic formatting
const toolbarItems: EditorToolbarItem[][] = [[
  { kind: 'mark', mark: 'bold', icon: 'i-lucide-bold', tooltip: { text: 'Bold' } },
  { kind: 'mark', mark: 'italic', icon: 'i-lucide-italic', tooltip: { text: 'Italic' } },
  { kind: 'mark', mark: 'underline', icon: 'i-lucide-underline', tooltip: { text: 'Underline' } },
], [
  { kind: 'link', icon: 'i-lucide-link', tooltip: { text: 'Link' } },
]]
</script>

<template>
  <div class="richtext-editor border border-default rounded-md focus-within:ring-2 focus-within:ring-primary/50 focus-within:border-primary transition-colors">
    <UEditor
      v-slot="{ editor }"
      v-model="content"
      content-type="markdown"
      :placeholder="placeholder"
      class="min-h-[100px]"
    >
      <UEditorToolbar
        v-if="editor"
        :editor="editor"
        :items="toolbarItems"
        layout="bubble"
      />
    </UEditor>
  </div>
</template>

<style>
@reference "~/assets/css/main.css";

.richtext-editor .tiptap {
  @apply p-3 outline-none min-h-[100px];
}

.richtext-editor .tiptap p.is-editor-empty:first-child::before {
  @apply text-muted pointer-events-none float-left h-0;
  content: attr(data-placeholder);
}

/* Basic prose styles for editor content */
.richtext-editor .tiptap {
  @apply text-sm;
}

.richtext-editor .tiptap p {
  @apply my-2 first:mt-0 last:mb-0;
}

.richtext-editor .tiptap ul,
.richtext-editor .tiptap ol {
  @apply my-2 pl-6;
}

.richtext-editor .tiptap ul {
  @apply list-disc;
}

.richtext-editor .tiptap ol {
  @apply list-decimal;
}

.richtext-editor .tiptap li {
  @apply my-1;
}

.richtext-editor .tiptap a {
  @apply text-primary underline;
}

.richtext-editor .tiptap strong {
  @apply font-semibold;
}

.richtext-editor .tiptap em {
  @apply italic;
}
</style>
