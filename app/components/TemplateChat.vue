<script setup lang="ts">
import type { UIMessage, FileUIPart, ToolIndicator, TokenUsageMetadata, InitialTokenUsage } from '~/types/chat'
import type { Chat } from '@ai-sdk/vue'
import type { ChatMode } from '~/utils/chatMode'
import { getInitialChatMode } from '~/utils/chatMode'

const props = withDefaults(defineProps<{
  /** Template ID — used by the default template chat mode */
  templateId?: string
  /** Initial messages to hydrate the chat */
  initialMessages: UIMessage[]
  /** Initial token usage from persisted entity data */
  initialTokenUsage?: InitialTokenUsage
  /** External chat instance — when provided, templateId is ignored */
  chatInstance?: {
    chat: Chat<UIMessage>
    sendMessage: (content: string, files?: FileUIPart[]) => void
    stopGeneration: () => Promise<void>
    reportPreviewError: (error: string) => void
    tokenUsage?: Ref<TokenUsageMetadata>
  }
  /** External mode ref — when provided, used instead of internal mode */
  externalMode?: Ref<ChatMode>
  /** Tool part types that indicate an "update" action (triggers the 'update' emit) */
  updateToolTypes?: string[]
  /** Tool indicator config — maps tool part type to display config */
  toolIndicators?: Record<string, ToolIndicator>
  /** Placeholder text for the input */
  placeholder?: string
  /** Empty state message */
  emptyMessage?: string
}>(), {
  templateId: undefined,
  initialTokenUsage: undefined,
  chatInstance: undefined,
  externalMode: undefined,
  updateToolTypes: () => ['tool-update_template', 'tool-patch_component'],
  toolIndicators: () => ({
    'tool-update_template': {
      loadingLabel: 'Updating template...',
      doneLabel: (input: Record<string, unknown>, output: Record<string, unknown>) => {
        if (output?.schemaChangeDetected) {
          const count = output.affectedActivitiesCount as number
          return `Schema change affects ${count} activit${count === 1 ? 'y' : 'ies'}`
        }
        if (output?.versionBumped) return `Template updated to v${output.schemaVersion}`
        return 'Template updated'
      },
      showFailure: true,
      failLabel: 'Update failed — retrying...',
    },
    'tool-patch_component': {
      loadingLabel: 'Patching component...',
      doneLabel: (input: Record<string, unknown>, output: Record<string, unknown>) => {
        if (output?.schemaChangeDetected) {
          const count = output.affectedActivitiesCount as number
          return `Schema change affects ${count} activit${count === 1 ? 'y' : 'ies'}`
        }
        if (output?.versionBumped) return `Template updated to v${output.schemaVersion}`
        return 'Template updated'
      },
      showFailure: true,
      failLabel: 'Patch failed — retrying...',
    },
    'tool-get_template': {
      loadingLabel: 'Reading template...',
      doneLabel: (input: Record<string, unknown>, output: Record<string, unknown>) => {
        if (output?.hasPendingChanges) return 'Template loaded (pending changes)'
        return undefined // silent completion
      },
    },
    'tool-get_reference': {
      loadingLabel: (input: Record<string, unknown>) => `Reading ${input?.topic || 'reference'} docs...`,
      doneLabel: (input: Record<string, unknown>) => `Loaded ${input?.topic || 'reference'} docs`,
      doneIcon: 'i-lucide-book-open',
    },
    'tool-commit_schema_change': {
      loadingLabel: (input: Record<string, unknown>) => {
        if (input?.action === 'migrate') return 'Migrating activities...'
        return 'Updating template version...'
      },
      doneLabel: (input: Record<string, unknown>, output: Record<string, unknown>) => {
        if (!output?.success) return undefined
        if (input?.action === 'migrate') {
          const count = output.migratedActivities as number
          return `Migrated ${count} activit${count === 1 ? 'y' : 'ies'} to v${output.schemaVersion}`
        }
        const skipped = output.skippedActivities as number
        return `Template v${output.schemaVersion} — ${skipped} activit${skipped === 1 ? 'y stays' : 'ies stay'} on old version`
      },
      doneIcon: 'i-lucide-git-branch',
      showFailure: true,
      failLabel: 'Migration failed — see error details',
    },
  }),
  placeholder: 'Describe your activity...',
  emptyMessage: 'Describe the activity you want to build.',
})

const emit = defineEmits<{
  update: []
}>()

// ─── Chat Mode (Plan / Build) ────────────────────────────────────────────────

const internalMode = ref<ChatMode>(getInitialChatMode(props.initialMessages.length > 0))
const mode = props.externalMode ?? internalMode

function toggleMode() {
  mode.value = mode.value === 'build' ? 'plan' : 'build'
}

// ─── Chat Instance ───────────────────────────────────────────────────────────

// Support both internal (template) and external (activity) chat instances
const templateChat = props.chatInstance
  ? null
  : useTemplateChat(props.templateId!, props.initialMessages, mode, props.initialTokenUsage)

const chat: Chat<UIMessage> = props.chatInstance ? props.chatInstance.chat : templateChat!.chat
const sendMessage = props.chatInstance ? props.chatInstance.sendMessage : templateChat!.sendMessage
const stopGeneration: () => Promise<void> = props.chatInstance ? props.chatInstance.stopGeneration : templateChat!.stopGeneration
const reportPreviewError: (error: string) => void = props.chatInstance ? props.chatInstance.reportPreviewError : templateChat!.reportPreviewError
const messageQueue = templateChat ? templateChat.messageQueue : ref([])
const clearQueue = templateChat ? templateChat.clearQueue : () => {}

// Token usage tracking
const tokenUsage = templateChat
  ? templateChat.tokenUsage
  : props.chatInstance?.tokenUsage ?? ref<TokenUsageMetadata>({
      totalTokens: props.initialTokenUsage?.totalTokens ?? 0,
      promptTokens: props.initialTokenUsage?.promptTokens ?? 0,
      completionTokens: props.initialTokenUsage?.completionTokens ?? 0,
    })

// Wire up update callback
if (templateChat) {
  templateChat.onTemplateUpdate.value = () => emit('update')
}

// Expose reportPreviewError so the parent page can forward preview errors
defineExpose({ reportPreviewError })

// ─── Message Filtering ───────────────────────────────────────────────────────

/**
 * Check if a message is an auto-reported preview error.
 * These are sent to the LLM for self-correction but hidden from the UI.
 */
function isPreviewErrorMessage(msg: UIMessage): boolean {
  if (msg.role !== 'user') return false
  const textPart = msg.parts.find(p => p.type === 'text') as { type: 'text'; text: string } | undefined
  return textPart?.text.startsWith('[Preview Error]') ?? false
}

function filterMessages(messages: UIMessage[]): UIMessage[] {
  return messages.filter(msg => !isPreviewErrorMessage(msg))
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
    :enable-attachments="true"
    :enable-mode-toggle="true"
    :placeholder="placeholder"
    empty-icon="i-lucide-message-square"
    :empty-message="emptyMessage"
    :tool-indicators="toolIndicators"
    :filter-messages="filterMessages"
    input-hint="Paste or attach images to include as reference."
    :attachment-entity-id="templateId"
    attachment-entity-type="template"
    @toggle-mode="toggleMode"
    @update="emit('update')"
  />
</template>
