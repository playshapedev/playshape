import { describe, it, expect } from 'vitest'
import type { TemplateField } from '../database/schema'
import { validateTemplate, checkHtmlInSampleData, checkMissingVHtml } from './templateValidation'

const fields: TemplateField[] = [
  { id: 'title', type: 'text', label: 'Title' },
  { id: 'count', type: 'number', label: 'Count' },
  {
    id: 'choices',
    type: 'array',
    label: 'Choices',
    fields: [{ id: 'text', type: 'textarea', label: 'Choice text' }],
  },
]

describe('checkHtmlInSampleData', () => {
  it('passes Markdown content', () => {
    expect(checkHtmlInSampleData(fields, { title: '**Bold** and [link](https://x.y)' })).toEqual([])
  })

  it('flags HTML tags in text fields', () => {
    const warnings = checkHtmlInSampleData(fields, { title: '<strong>Bold</strong>' })

    expect(warnings).toHaveLength(1)
    expect(warnings[0]).toMatchObject({ type: 'html_in_sample_data', field: 'title' })
  })

  it('allows <br> and <hr>', () => {
    expect(checkHtmlInSampleData(fields, { title: 'Line one<br>Line two<hr/>' })).toEqual([])
  })

  it('ignores HTML inside inline code and code blocks', () => {
    expect(checkHtmlInSampleData(fields, { title: 'Use `<div>` here' })).toEqual([])
    expect(checkHtmlInSampleData(fields, { title: '```\n<div>example</div>\n```' })).toEqual([])
  })

  it('checks nested array items and reports their path', () => {
    const warnings = checkHtmlInSampleData(fields, {
      choices: [{ text: 'fine' }, { text: '<em>nope</em>' }],
    })

    expect(warnings.map(w => w.field)).toEqual(['choices[1].text'])
  })

  it('ignores non-text fields', () => {
    expect(checkHtmlInSampleData([{ id: 'n', type: 'number', label: 'N' }], { n: '<b>1</b>' })).toEqual([])
  })
})

describe('checkMissingVHtml', () => {
  it('flags text fields rendered with interpolation', () => {
    const warnings = checkMissingVHtml(fields, '<template><h1>{{ data.title }}</h1></template>')

    expect(warnings).toEqual([expect.objectContaining({ type: 'missing_v_html', field: 'title' })])
  })

  it('flags nested fields rendered through a loop variable', () => {
    const component = '<template><li v-for="choice in data.choices">{{ choice.text }}</li></template>'
    expect(checkMissingVHtml(fields, component).map(w => w.field)).toEqual(['text'])
  })

  it('passes text fields rendered with v-html', () => {
    expect(checkMissingVHtml(fields, '<template><h1 v-html="data.title" /></template>')).toEqual([])
  })

  it('does not flag non-text fields', () => {
    expect(checkMissingVHtml(fields, '<template><span>{{ data.count }}</span></template>')).toEqual([])
  })

  it('returns nothing when the component has no template block', () => {
    expect(checkMissingVHtml(fields, '<script setup>const x = 1</script>')).toEqual([])
  })
})

describe('validateTemplate', () => {
  it('combines both checks', () => {
    const warnings = validateTemplate(
      fields,
      { title: '<b>Hi</b>' },
      '<template>{{ data.title }}</template>',
    )

    expect(warnings.map(w => w.type).sort()).toEqual(['html_in_sample_data', 'missing_v_html'])
  })
})
