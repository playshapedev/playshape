import { getContentCleanupEnabled, getImageAspectRatio } from '../utils/settings'

/**
 * GET /api/settings
 * Returns all app settings.
 */
export default defineEventHandler(() => {
  return {
    contentCleanupEnabled: getContentCleanupEnabled(),
    imageAspectRatio: getImageAspectRatio(),
  }
})
