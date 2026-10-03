import { describe, it, expect } from 'vitest'
import type { TemplateField } from '../database/schema'
import { validateDataAgainstSchema } from './buildZodFromInputSchema'

describe('validateDataAgainstSchema', () => {
  it('accepts anything when there is no schema', () => {
    expect(validateDataAgainstSchema({ any: 'thing' }, null).success).toBe(true)
    expect(validateDataAgainstSchema({}, []).success).toBe(true)
  })

  it('enforces required fields and types', () => {
    const schema: TemplateField[] = [
      { id: 'title', type: 'text', label: 'Title', required: true },
      { id: 'done', type: 'checkbox', label: 'Done', required: true },
    ]

    expect(validateDataAgainstSchema({ title: 'Hi', done: false }, schema).success).toBe(true)

    const result = validateDataAgainstSchema({ done: 'yes' }, schema)
    expect(result.success).toBe(false)
    if (!result.success) {
      expect(result.errors.some(e => e.startsWith('title:'))).toBe(true)
      expect(result.errors.some(e => e.startsWith('done:'))).toBe(true)
    }
  })

  it('lets optional fields be missing or null', () => {
    const schema: TemplateField[] = [{ id: 'note', type: 'textarea', label: 'Note' }]

    expect(validateDataAgainstSchema({}, schema).success).toBe(true)
    expect(validateDataAgainstSchema({ note: null }, schema).success).toBe(true)
  })

  it('applies number min and max', () => {
    const schema: TemplateField[] = [{ id: 'score', type: 'number', label: 'Score', required: true, min: 0, max: 10 }]

    expect(validateDataAgainstSchema({ score: 5 }, schema).success).toBe(true)
    expect(validateDataAgainstSchema({ score: -1 }, schema).success).toBe(false)
    expect(validateDataAgainstSchema({ score: 11 }, schema).success).toBe(false)
  })

  it('restricts dropdowns to their options', () => {
    const schema: TemplateField[] = [{ id: 'level', type: 'dropdown', label: 'Level', required: true, options: ['easy', 'hard'] }]

    expect(validateDataAgainstSchema({ level: 'easy' }, schema).success).toBe(true)
    expect(validateDataAgainstSchema({ level: 'medium' }, schema).success).toBe(false)
  })

  it('validates each item of an array field and reports the item path', () => {
    const schema: TemplateField[] = [{
      id: 'steps',
      type: 'array',
      label: 'Steps',
      required: true,
      fields: [{ id: 'text', type: 'text', label: 'Text', required: true }],
    }]

    expect(validateDataAgainstSchema({ steps: [{ text: 'a' }, { text: 'b' }] }, schema).success).toBe(true)

    const result = validateDataAgainstSchema({ steps: [{ text: 'a' }, {}] }, schema)
    expect(result.success).toBe(false)
    if (!result.success) expect(result.errors[0]).toMatch(/^steps\.1\.text:/)
  })

  it('validates image references', () => {
    const schema: TemplateField[] = [{ id: 'hero', type: 'image', label: 'Hero', required: true }]

    expect(validateDataAgainstSchema({ hero: { assetId: 'a', imageId: 'i' } }, schema).success).toBe(true)
    expect(validateDataAgainstSchema({ hero: null }, schema).success).toBe(true)
    expect(validateDataAgainstSchema({ hero: { assetId: 'a' } }, schema).success).toBe(false)
  })
})
