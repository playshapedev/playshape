export interface AppSettings {
  contentCleanupEnabled: boolean
  imageAspectRatio: string
}

/**
 * Composable for managing app settings.
 */
export function useSettings() {
  const { data: settings, pending, error, refresh } = useFetch<AppSettings>('/api/settings')

  async function updateSettings(updates: Partial<AppSettings>) {
    await $fetch('/api/settings', {
      method: 'PATCH',
      body: updates,
    })
    await refresh()
  }

  return {
    settings,
    pending,
    error,
    refresh,
    updateSettings,
  }
}
