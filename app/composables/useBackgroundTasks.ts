/**
 * Background task management for long-running operations.
 *
 * Provides a global, reactive store for tracking tasks like image generation
 * and video processing. Tasks persist in memory across navigation but are
 * lost on page refresh (which is why Cmd+R is disabled in Electron).
 *
 * Usage:
 *   const { tasks, addTask, updateTask, completeTask, failTask, removeTask } = useBackgroundTasks()
 *
 *   // Start a task
 *   const taskId = addTask({
 *     type: 'image-generation',
 *     title: 'Generating image',
 *     description: 'A beautiful sunset...',
 *   })
 *
 *   // Update progress (for tasks with progress tracking)
 *   updateTask(taskId, { progress: 50 })
 *
 *   // Complete with result
 *   completeTask(taskId, { assetId: '...', imageId: '...' })
 *
 *   // Or fail with error
 *   failTask(taskId, 'Generation failed: API error')
 */

export type BackgroundTaskType = 'image-generation' | 'video-upload' | 'video-processing'

export type BackgroundTaskStatus = 'pending' | 'running' | 'completed' | 'failed'

export interface BackgroundTask<TResult = unknown> {
  id: string
  type: BackgroundTaskType
  status: BackgroundTaskStatus
  title: string
  description?: string
  /** Progress percentage (0-100), if applicable */
  progress?: number
  /** Result data on completion */
  result?: TResult
  /** Error message on failure */
  error?: string
  /** Timestamp when task was created */
  createdAt: Date
  /** Timestamp when task completed or failed */
  completedAt?: Date
}

/** Result type for image generation tasks */
export interface ImageGenerationResult {
  assetId: string
  imageId: string
  url: string
}

/** Result type for video upload/processing tasks */
export interface VideoProcessingResult {
  assetId: string
  videoId: string
  url?: string
  thumbnailUrl?: string
}

// Global reactive state - persists across component instances
const tasks = ref<BackgroundTask[]>([])

/**
 * Get all background tasks, sorted by creation time (newest first).
 */
export function useBackgroundTasks() {
  const sortedTasks = computed(() =>
    [...tasks.value].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()),
  )

  const pendingTasks = computed(() =>
    sortedTasks.value.filter(t => t.status === 'pending' || t.status === 'running'),
  )

  const completedTasks = computed(() =>
    sortedTasks.value.filter(t => t.status === 'completed' || t.status === 'failed'),
  )

  const hasPendingTasks = computed(() => pendingTasks.value.length > 0)

  /**
   * Add a new background task.
   * @returns The task ID
   */
  function addTask(options: {
    type: BackgroundTaskType
    title: string
    description?: string
  }): string {
    const id = crypto.randomUUID()
    const task: BackgroundTask = {
      id,
      type: options.type,
      status: 'pending',
      title: options.title,
      description: options.description,
      createdAt: new Date(),
    }
    tasks.value.push(task)
    return id
  }

  /**
   * Update a task's properties.
   */
  function updateTask(id: string, updates: Partial<Pick<BackgroundTask, 'status' | 'progress' | 'title' | 'description'>>) {
    const task = tasks.value.find(t => t.id === id)
    if (task) {
      Object.assign(task, updates)
    }
  }

  /**
   * Start a task (set status to running).
   */
  function startTask(id: string) {
    updateTask(id, { status: 'running' })
  }

  /**
   * Mark a task as completed with a result.
   */
  function completeTask<TResult>(id: string, result: TResult) {
    const task = tasks.value.find(t => t.id === id)
    if (task) {
      task.status = 'completed'
      task.result = result
      task.progress = 100
      task.completedAt = new Date()
    }
  }

  /**
   * Mark a task as failed with an error message.
   */
  function failTask(id: string, error: string) {
    const task = tasks.value.find(t => t.id === id)
    if (task) {
      task.status = 'failed'
      task.error = error
      task.completedAt = new Date()
    }
  }

  /**
   * Remove a task from the list (typically after user dismisses it).
   */
  function removeTask(id: string) {
    const index = tasks.value.findIndex(t => t.id === id)
    if (index !== -1) {
      tasks.value.splice(index, 1)
    }
  }

  /**
   * Clear all completed/failed tasks.
   */
  function clearCompleted() {
    tasks.value = tasks.value.filter(t => t.status === 'pending' || t.status === 'running')
  }

  /**
   * Get a specific task by ID.
   */
  function getTask(id: string): BackgroundTask | undefined {
    return tasks.value.find(t => t.id === id)
  }

  return {
    tasks: sortedTasks,
    pendingTasks,
    completedTasks,
    hasPendingTasks,
    addTask,
    updateTask,
    startTask,
    completeTask,
    failTask,
    removeTask,
    clearCompleted,
    getTask,
  }
}

/**
 * Helper to run an async operation as a background task.
 * Automatically handles status updates and error handling.
 *
 * @example
 * const result = await runBackgroundTask({
 *   type: 'image-generation',
 *   title: 'Generating image',
 *   description: prompt,
 *   run: async (updateProgress) => {
 *     const response = await $fetch('/api/assets/generate', { ... })
 *     return { assetId: response.id, imageId: response.imageId, url: response.image.url }
 *   },
 * })
 */
export async function runBackgroundTask<TResult>(options: {
  type: BackgroundTaskType
  title: string
  description?: string
  run: (updateProgress: (progress: number) => void) => Promise<TResult>
}): Promise<{ taskId: string, result: TResult } | { taskId: string, error: string }> {
  const { addTask, startTask, updateTask, completeTask, failTask } = useBackgroundTasks()

  const taskId = addTask({
    type: options.type,
    title: options.title,
    description: options.description,
  })

  startTask(taskId)

  try {
    const result = await options.run((progress: number) => {
      updateTask(taskId, { progress })
    })
    completeTask(taskId, result)
    return { taskId, result }
  }
  catch (err) {
    const errorMessage = err instanceof Error ? err.message : 'Unknown error'
    failTask(taskId, errorMessage)
    return { taskId, error: errorMessage }
  }
}

/**
 * Generate an image in the background.
 * Returns immediately with a task ID - check task status for completion.
 */
export function generateImageInBackground(options: {
  prompt: string
  name?: string
  projectId?: string
  aspectRatio?: '1:1' | '16:9' | '9:16' | '21:9' | '4:3' | '3:4'
}): string {
  const { addTask, startTask, completeTask, failTask } = useBackgroundTasks()

  const taskId = addTask({
    type: 'image-generation',
    title: options.name || 'Generating image',
    description: options.prompt.slice(0, 100) + (options.prompt.length > 100 ? '...' : ''),
  })

  // Start the generation in the background (don't await)
  startTask(taskId)

  $fetch('/api/assets/generate', {
    method: 'POST',
    body: {
      prompt: options.prompt,
      name: options.name,
      projectId: options.projectId,
      aspectRatio: options.aspectRatio,
    },
  })
    .then((response) => {
      completeTask<ImageGenerationResult>(taskId, {
        assetId: response.id,
        imageId: response.imageId,
        url: response.image.url,
      })
    })
    .catch((err) => {
      const errorMessage = err instanceof Error
        ? err.message
        : err?.data?.statusMessage || 'Image generation failed'
      failTask(taskId, errorMessage)
    })

  return taskId
}
