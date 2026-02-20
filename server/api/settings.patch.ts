import { z } from 'zod'
import {
  setContentCleanupEnabled,
  getContentCleanupEnabled,
  setImageAspectRatio,
  getImageAspectRatio,
} from '../utils/settings'

const settingsSchema = z.object({
  contentCleanupEnabled: z.boolean().optional(),
  imageAspectRatio: z.string().optional(),
})

/**
 * PATCH /api/settings
 * Updates app settings. Only provided fields are updated.
 */
export default defineEventHandler(async (event) => {
  const body = await readBody(event)
  const parsed = settingsSchema.parse(body)

  if (parsed.contentCleanupEnabled !== undefined) {
    setContentCleanupEnabled(parsed.contentCleanupEnabled)
  }

  if (parsed.imageAspectRatio !== undefined) {
    setImageAspectRatio(parsed.imageAspectRatio)
  }

  // Return updated settings
  return {
    contentCleanupEnabled: getContentCleanupEnabled(),
    imageAspectRatio: getImageAspectRatio(),
  }
})
