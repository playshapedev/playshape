<script setup lang="ts">
import type { UIMessage, ToolIndicator, InitialTokenUsage } from '~/types/chat'
import type { ChatMode } from '~/utils/chatMode'
import { getInitialChatMode } from '~/utils/chatMode'

const props = defineProps<{
  libraryId: string
  documentId: string
  initialMessages: UIMessage[]
  initialTokenUsage?: InitialTokenUsage
}>()

const emit = defineEmits<{
  update: []
}>()

// ─── Chat Mode (Plan / Build) ────────────────────────────────────────────────

const mode = ref<ChatMode>(getInitialChatMode(props.initialMessages.length > 0))

function toggleMode() {
  mode.value = mode.value === 'build' ? 'plan' : 'build'
}

// ─── Chat Instance ───────────────────────────────────────────────────────────

const documentChat = useDocumentChat(props.libraryId, props.documentId, props.initialMessages, mode, props.initialTokenUsage)
documentChat.onDocumentUpdate.value = () => emit('update')

const { chat, sendMessage, stopGeneration, tokenUsage, messageQueue, clearQueue } = documentChat

// ─── Tool Indicators ─────────────────────────────────────────────────────────

const toolIndicators: Record<string, ToolIndicator> = {
  'tool-fetch_url': {
    loadingLabel: (input: Record<string, unknown>) => `Fetching ${input?.url || 'URL'}...`,
    doneLabel: (input: Record<string, unknown>, output: Record<string, unknown>) => {
      if (output?.success) return `Fetched: ${output?.title || 'page'}`
      return `Failed: ${output?.error}`
    },
    doneIcon: 'i-lucide-check-circle',
    showFailure: true,
  },
  'tool-get_document': {
    loadingLabel: 'Reading document...',
    doneLabel: undefined, // silent completion
  },
  'tool-update_document': {
    loadingLabel: 'Creating document...',
    doneLabel: (input: Record<string, unknown>, output: Record<string, unknown>) => {
      return output?.success ? 'Document updated' : undefined
    },
    showFailure: true,
    failLabel: 'Update failed — retrying...',
  },
  'tool-patch_document': {
    loadingLabel: 'Updating document...',
    doneLabel: (input: Record<string, unknown>, output: Record<string, unknown>) => {
      return output?.success ? 'Document updated' : undefined
    },
    showFailure: true,
    failLabel: 'Patch failed — retrying...',
  },
}
</script>

<template>
  <BaseChat
    :chat="chat"
    :send-message="sendMessage"
    :stop-generation="stopGeneration"
    :token-usage="tokenUsage"
    :mode="mode"
    :message-queue="messageQueue"
    :clear-queue="clearQueue"
    :enable-attachments="false"
    :enable-mode-toggle="true"
    placeholder="Describe what you want to create or change..."
    empty-icon="i-lucide-file-text"
    empty-message="Describe the document you want to create."
    :tool-indicators="toolIndicators"
    @toggle-mode="toggleMode"
    @update="emit('update')"
  />
</template>
