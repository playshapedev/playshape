/**
 * Default Interface Template
 *
 * A minimal fallback interface SFC used when a course doesn't have
 * an assigned interface template. Provides basic navigation and
 * progress display.
 */

/**
 * Returns the default interface SFC source code.
 *
 * The interface:
 * - Shows course title and current activity name
 * - Displays progress (X of Y)
 * - Has Previous/Next navigation buttons
 * - Listens for playshape:activity-changed events
 * - Dispatches playshape:navigate events
 * - Uses the design token system for consistent styling
 */
export function getDefaultInterfaceSfc(): string {
  return `<template>
  <div class="min-h-screen flex flex-col bg-default">
    <!-- Header -->
    <header class="border-b border-default px-4 py-3 flex items-center justify-between bg-muted">
      <div class="flex items-center gap-3">
        <h1 class="text-lg font-semibold text-highlighted">{{ courseTitle }}</h1>
        <span class="text-sm text-muted">|</span>
        <span class="text-sm text-default">{{ currentActivityName }}</span>
      </div>
      <div class="text-sm text-muted">
        {{ completedActivities }} of {{ totalActivities }} complete
      </div>
    </header>

    <!-- Progress bar -->
    <div class="h-1 bg-elevated">
      <div
        class="h-full bg-primary transition-all duration-300"
        :style="{ width: progressPercent + '%' }"
      />
    </div>

    <!-- Main content area with activity slot -->
    <main class="flex-1 overflow-auto">
      <div id="activity-slot" data-activity-slot class="h-full" />
    </main>

    <!-- Footer navigation -->
    <footer class="border-t border-default px-4 py-3 flex items-center justify-between bg-muted">
      <button
        type="button"
        :disabled="isFirstActivity"
        class="px-4 py-2 rounded-ui text-sm font-medium transition-colors"
        :class="isFirstActivity
          ? 'bg-elevated text-dimmed cursor-not-allowed'
          : 'bg-elevated text-default hover:bg-accented'"
        @click="navigatePrev"
      >
        Previous
      </button>

      <span class="text-sm text-muted">
        {{ currentIndex + 1 }} / {{ totalActivities }}
      </span>

      <button
        type="button"
        :disabled="isLastActivity"
        class="px-4 py-2 rounded-ui text-sm font-medium transition-colors"
        :class="isLastActivity
          ? 'bg-elevated text-dimmed cursor-not-allowed'
          : 'bg-primary text-white hover:opacity-90'"
        @click="navigateNext"
      >
        {{ isLastActivity ? 'Complete' : 'Next' }}
      </button>
    </footer>
  </div>
</template>

<script setup>
import { ref, computed, onMounted, onUnmounted } from 'vue'

const props = defineProps({
  data: {
    type: Object,
    default: () => ({})
  }
})

// State
const courseTitle = ref(props.data.courseTitle || 'Course')
const currentActivityName = ref('Loading...')
const currentIndex = ref(0)
const totalActivities = ref(1)
const completedActivities = ref(0)

// Computed
const progressPercent = computed(() => {
  if (totalActivities.value === 0) return 0
  return Math.round((completedActivities.value / totalActivities.value) * 100)
})

const isFirstActivity = computed(() => currentIndex.value === 0)
const isLastActivity = computed(() => currentIndex.value >= totalActivities.value - 1)

// Navigation
function navigateNext() {
  window.dispatchEvent(new CustomEvent('playshape:navigate', {
    detail: { action: 'next' }
  }))
}

function navigatePrev() {
  window.dispatchEvent(new CustomEvent('playshape:navigate', {
    detail: { action: 'prev' }
  }))
}

// Event handlers
function onActivityChanged(e) {
  const detail = e.detail || {}
  currentActivityName.value = detail.activityName || 'Activity'
  currentIndex.value = detail.flatIndex || 0
  totalActivities.value = detail.totalActivities || 1
  completedActivities.value = detail.completedActivities || 0
}

function onActivityCompleted(e) {
  // Refresh completed count
  completedActivities.value++
}

// Lifecycle
onMounted(() => {
  window.addEventListener('playshape:activity-changed', onActivityChanged)
  window.addEventListener('playshape:activity-completed', onActivityCompleted)

  // Initialize CourseAPI
  if (window.CourseAPI) {
    window.CourseAPI.initialize()
  }
})

onUnmounted(() => {
  window.removeEventListener('playshape:activity-changed', onActivityChanged)
  window.removeEventListener('playshape:activity-completed', onActivityCompleted)

  // Terminate CourseAPI
  if (window.CourseAPI) {
    window.CourseAPI.terminate()
  }
})
<\/script>
`
}

/**
 * Returns the default interface's input schema.
 * This matches the TemplateField[] format.
 */
export function getDefaultInterfaceInputSchema(): Array<{
  id: string
  label: string
  type: string
  placeholder?: string
  default?: string
}> {
  return [
    {
      id: 'courseTitle',
      label: 'Course Title',
      type: 'text',
      placeholder: 'My Course',
      default: 'Course',
    },
  ]
}

/**
 * Returns sample data for the default interface.
 */
export function getDefaultInterfaceSampleData(): Record<string, unknown> {
  return {
    courseTitle: 'Customer Service Training',
  }
}
