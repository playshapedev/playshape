/** Supported aspect ratios with user-friendly labels */
export const ASPECT_RATIOS = [
  { value: '1:1', label: 'Square', description: '1:1' },
  { value: '16:9', label: 'Landscape', description: '16:9' },
  { value: '9:16', label: 'Portrait', description: '9:16' },
  { value: '21:9', label: 'Wide', description: '21:9' },
  { value: '4:3', label: 'Classic', description: '4:3' },
  { value: '3:4', label: 'Photo Portrait', description: '3:4' },
] as const

export const DEFAULT_ASPECT_RATIO = '1:1'

export type AspectRatio = (typeof ASPECT_RATIOS)[number]['value']
