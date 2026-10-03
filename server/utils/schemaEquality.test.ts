import { describe, it, expect } from 'vitest'
import type { TemplateField } from '../database/schema'
import { hasSchemaChanged } from './schemaEquality'

const title: TemplateField = { id: 'title', type: 'text', label: 'Title', required: true }

describe('hasSchemaChanged', () => {
  it('treats null, undefined and empty as the same', () => {
    expect(hasSchemaChanged(null, undefined)).toBe(false)
    expect(hasSchemaChanged(null, [])).toBe(false)
  })

  it('ignores display-only changes', () => {
    expect(hasSchemaChanged([title], [{ ...title, label: 'Heading', placeholder: 'Type here' }])).toBe(false)
  })

  it('detects added or removed fields', () => {
    expect(hasSchemaChanged([title], [])).toBe(true)
    expect(hasSchemaChanged([], [title])).toBe(true)
  })

  it('detects changes that alter the data shape', () => {
    expect(hasSchemaChanged([title], [{ ...title, id: 'heading' }])).toBe(true)
    expect(hasSchemaChanged([title], [{ ...title, type: 'textarea' }])).toBe(true)
    expect(hasSchemaChanged([title], [{ ...title, required: false }])).toBe(true)
  })

  it('detects dropdown option and number range changes', () => {
    const level: TemplateField = { id: 'level', type: 'dropdown', label: 'Level', options: ['a', 'b'] }
    expect(hasSchemaChanged([level], [{ ...level, options: ['a', 'c'] }])).toBe(true)

    const score: TemplateField = { id: 'score', type: 'number', label: 'Score', min: 0, max: 10 }
    expect(hasSchemaChanged([score], [{ ...score, max: 5 }])).toBe(true)
  })

  it('checks nested array fields', () => {
    const list: TemplateField = { id: 'items', type: 'array', label: 'Items', fields: [title] }

    expect(hasSchemaChanged([list], [{ ...list, fields: [{ ...title, label: 'Renamed' }] }])).toBe(false)
    expect(hasSchemaChanged([list], [{ ...list, fields: [{ ...title, type: 'number' }] }])).toBe(true)
  })
})
