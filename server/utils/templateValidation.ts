import type { TemplateField } from '../database/schema'

export interface ValidationWarning {
  type: 'html_in_sample_data' | 'missing_v_html'
  field: string
  message: string
}

/**
 * Validate template for common issues and return warnings.
 * These are non-blocking warnings that the LLM should address.
 */
export function validateTemplate(
  fields: TemplateField[],
  sampleData: Record<string, unknown>,
  component: string,
): ValidationWarning[] {
  return [
    ...checkHtmlInSampleData(fields, sampleData),
    ...checkMissingVHtml(fields, component),
  ]
}

/**
 * Check sampleData for HTML tags in text/textarea fields.
 * HTML should be avoided - use Markdown instead (system converts to HTML).
 *
 * Allowed exceptions:
 * - <br>, <br/>, <hr>, <hr/> tags
 * - Content inside backticks (inline code) or triple backticks (code blocks)
 */
export function checkHtmlInSampleData(
  fields: TemplateField[],
  sampleData: Record<string, unknown>,
  path = '',
): ValidationWarning[] {
  const warnings: ValidationWarning[] = []

  // Match HTML tags except <br>, <br/>, <hr>, <hr/>
  const htmlTagRegex = /<(?!br\s*\/?>|hr\s*\/?>)[a-z][^>]*>/i

  for (const field of fields) {
    const fieldPath = path ? `${path}.${field.id}` : field.id

    if (field.type === 'text' || field.type === 'textarea') {
      const value = sampleData[field.id]
      if (typeof value === 'string') {
        // Strip code blocks and inline code before checking
        const withoutCode = value
          .replace(/```[\s\S]*?```/g, '') // fenced code blocks
          .replace(/`[^`]+`/g, '') // inline code

        if (htmlTagRegex.test(withoutCode)) {
          warnings.push({
            type: 'html_in_sample_data',
            field: fieldPath,
            message: `sampleData["${fieldPath}"] contains HTML tags. Use Markdown instead (e.g., **bold**, *italic*, [link](url)). To include literal HTML code, wrap it in backticks.`,
          })
        }
      }
    }

    // Recursively check array fields
    if (field.type === 'array' && field.fields && Array.isArray(sampleData[field.id])) {
      const items = sampleData[field.id] as Record<string, unknown>[]
      for (let i = 0; i < items.length; i++) {
        const item = items[i]
        if (item && typeof item === 'object') {
          warnings.push(...checkHtmlInSampleData(
            field.fields,
            item,
            `${fieldPath}[${i}]`,
          ))
        }
      }
    }
  }

  return warnings
}

/**
 * Check component for text/textarea fields rendered with {{ }} instead of v-html.
 * Text fields should use v-html to render Markdown-converted HTML properly.
 */
export function checkMissingVHtml(
  fields: TemplateField[],
  component: string,
): ValidationWarning[] {
  const warnings: ValidationWarning[] = []

  // Extract template section
  const templateMatch = component.match(/<template>([\s\S]*?)<\/template>/)
  if (!templateMatch?.[1]) return warnings
  const template = templateMatch[1]

  // Get all text/textarea field IDs
  const textFieldIds = collectTextFieldIds(fields)

  for (const fieldId of textFieldIds) {
    // Match {{ data.fieldId }} or {{ data.item.fieldId }} or {{ item.fieldId }} patterns
    // This catches: {{ data.title }}, {{ data.questions[0].text }}, {{ item.label }}, etc.
    const escapedId = fieldId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const interpolationRegex = new RegExp(
      `\\{\\{[^}]*\\b(?:data|item|element|entry|row|option|choice|step|question|answer)(?:\\.\\w+)*\\.${escapedId}\\b[^}]*\\}\\}`,
    )

    if (interpolationRegex.test(template)) {
      warnings.push({
        type: 'missing_v_html',
        field: fieldId,
        message: `Field "${fieldId}" is rendered with {{ interpolation }} but should use v-html for formatted content. Change to v-html="..." instead.`,
      })
    }
  }

  return warnings
}

/**
 * Recursively collect all text/textarea field IDs from the schema.
 */
function collectTextFieldIds(fields: TemplateField[]): string[] {
  const ids: string[] = []
  for (const field of fields) {
    if (field.type === 'text' || field.type === 'textarea') {
      ids.push(field.id)
    }
    if (field.type === 'array' && field.fields) {
      ids.push(...collectTextFieldIds(field.fields))
    }
  }
  return ids
}
