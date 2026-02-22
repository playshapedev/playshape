import type { TemplateField } from '../database/schema'

/**
 * Fields that are display-only and don't affect data structure.
 * Changes to these don't require a version bump.
 */
const DISPLAY_ONLY_KEYS: (keyof TemplateField)[] = ['label', 'placeholder']

/**
 * Checks if two inputSchema arrays represent structurally different data shapes.
 * Ignores display-only fields like label and placeholder.
 *
 * @returns true if the schemas are structurally different (require version bump)
 */
export function hasSchemaChanged(
  oldSchema: TemplateField[] | null | undefined,
  newSchema: TemplateField[] | null | undefined,
): boolean {
  // Normalize nullish values to empty arrays
  const old = oldSchema ?? []
  const current = newSchema ?? []

  // Quick length check
  if (old.length !== current.length) {
    return true
  }

  // Compare each field
  for (let i = 0; i < old.length; i++) {
    if (hasFieldChanged(old[i]!, current[i]!)) {
      return true
    }
  }

  return false
}

/**
 * Compares two individual fields for structural equality.
 */
function hasFieldChanged(oldField: TemplateField, newField: TemplateField): boolean {
  // Check core identity and type
  if (oldField.id !== newField.id) return true
  if (oldField.type !== newField.type) return true

  // Check structural properties
  if (oldField.required !== newField.required) return true
  if (!arraysEqual(oldField.options, newField.options)) return true

  // For number fields, check constraints
  if (oldField.type === 'number') {
    if (oldField.min !== newField.min) return true
    if (oldField.max !== newField.max) return true
  }

  // For array fields, recursively check nested fields
  if (oldField.type === 'array') {
    if (hasSchemaChanged(oldField.fields, newField.fields)) return true
  }

  // Note: We intentionally ignore 'label', 'placeholder', and 'default'
  // - label/placeholder are display-only
  // - default changes the initial value but not the data shape

  return false
}

/**
 * Shallow comparison of string arrays.
 */
function arraysEqual(a: string[] | undefined, b: string[] | undefined): boolean {
  if (a === b) return true
  if (!a || !b) return a === b
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false
  }
  return true
}
