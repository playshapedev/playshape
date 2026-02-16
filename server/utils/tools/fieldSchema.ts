import { z } from 'zod'

/**
 * Shared Zod schemas for template/activity field definitions.
 *
 * Uses explicit depth-limited schemas (3 levels) to avoid z.lazy() / $ref
 * which many OpenAI-compatible providers reject in tool definitions.
 */

export const fieldTypeEnum = z.enum(['text', 'textarea', 'dropdown', 'checkbox', 'number', 'color', 'array'])

export const baseFieldProps = {
  id: z.string().describe('Unique field identifier (camelCase)'),
  type: fieldTypeEnum.describe('Input field type'),
  label: z.string().describe('Human-readable field label'),
  required: z.boolean().optional().describe('Whether the field is required'),
  placeholder: z.string().optional().describe('Placeholder text for text/textarea'),
  options: z.array(z.string()).optional().describe('Options for dropdown fields'),
  default: z.union([z.string(), z.number(), z.boolean(), z.null()]).optional().describe('Default value for non-array fields'),
  min: z.number().optional().describe('Minimum value for number fields'),
  max: z.number().optional().describe('Maximum value for number fields'),
}

export const leafFieldSchema = z.object({ ...baseFieldProps })

export const midFieldSchema = z.object({
  ...baseFieldProps,
  fields: z.array(leafFieldSchema).optional().describe('Sub-field definitions for array type (deepest level)'),
})

export const fieldSchema = z.object({
  ...baseFieldProps,
  fields: z.array(midFieldSchema).optional().describe('Sub-field definitions for array type. Each item in the array will have these fields.'),
})
