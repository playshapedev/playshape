import { z } from 'zod'
import type { TemplateField } from '../database/schema'

/**
 * Converts a template's inputSchema field definitions into a Zod schema
 * that can be used to validate activity data.
 *
 * @param inputSchema - Array of field definitions
 * @returns A Zod object schema that validates data against the field definitions
 */
export function buildZodSchema(inputSchema: TemplateField[] | null | undefined): z.ZodObject<Record<string, z.ZodTypeAny>> {
  if (!inputSchema || inputSchema.length === 0) {
    return z.object({})
  }

  const shape = Object.fromEntries(
    inputSchema.map(field => [field.id, buildFieldSchema(field)]),
  )

  return z.object(shape)
}

/**
 * Builds a Zod schema for a single field.
 */
function buildFieldSchema(field: TemplateField): z.ZodTypeAny {
  let schema: z.ZodTypeAny

  switch (field.type) {
    case 'text':
    case 'textarea':
    case 'color':
      schema = z.string()
      break

    case 'number': {
      let numSchema = z.number()
      if (field.min !== undefined) {
        numSchema = numSchema.min(field.min)
      }
      if (field.max !== undefined) {
        numSchema = numSchema.max(field.max)
      }
      schema = numSchema
      break
    }

    case 'checkbox':
      schema = z.boolean()
      break

    case 'dropdown':
      if (field.options && field.options.length > 0) {
        // Create a union of literal strings for the enum
        schema = z.enum(field.options as [string, ...string[]])
      }
      else {
        schema = z.string()
      }
      break

    case 'image':
      // Image fields store { assetId, imageId }
      schema = z.object({
        assetId: z.string(),
        imageId: z.string(),
      }).nullable()
      break

    case 'video':
      // Video fields store { source, url, assetId?, videoId? }
      schema = z.object({
        source: z.enum(['youtube', 'vimeo', 'upload']),
        url: z.string(),
        assetId: z.string().optional(),
        videoId: z.string().optional(),
      }).nullable()
      break

    case 'array':
      if (field.fields && field.fields.length > 0) {
        // Build schema for nested fields
        const itemSchema = buildZodSchema(field.fields)
        schema = z.array(itemSchema)
      }
      else {
        // Array without defined structure - accept any array
        schema = z.array(z.unknown())
      }
      break

    default:
      // Unknown field type - accept any value
      schema = z.unknown()
  }

  // Make optional if not required
  if (!field.required) {
    schema = schema.optional().nullable()
  }

  return schema
}

/**
 * Validates data against an inputSchema.
 *
 * @param data - The data to validate
 * @param inputSchema - The schema to validate against
 * @returns Result with success flag and either the validated data or error details
 */
export function validateDataAgainstSchema(
  data: unknown,
  inputSchema: TemplateField[] | null | undefined,
): { success: true; data: Record<string, unknown> } | { success: false; errors: string[] } {
  const schema = buildZodSchema(inputSchema)

  const result = schema.safeParse(data)

  if (result.success) {
    return { success: true, data: result.data }
  }

  // Extract readable error messages
  const errors = result.error.issues.map((issue) => {
    const path = issue.path.join('.')
    return path ? `${path}: ${issue.message}` : issue.message
  })

  return { success: false, errors }
}
