import { describe, it, expect } from 'vitest'
import { buildManifest } from './buildManifest'

const base = { courseId: 'abc-123', courseName: 'Safety Basics', files: ['index.html'] }

describe('buildManifest', () => {
  it('builds a SCORM 1.2 manifest', () => {
    const xml = buildManifest({ ...base, scormVersion: 'scorm-1.2' })

    expect(xml).toContain('<schemaversion>1.2</schemaversion>')
    expect(xml).toContain('adlcp:scormtype="sco"')
    expect(xml).toContain('href="index.html"')
  })

  it('builds a SCORM 2004 manifest', () => {
    const xml = buildManifest({ ...base, scormVersion: 'scorm-2004' })

    expect(xml).toContain('<schemaversion>2004 3rd Edition</schemaversion>')
    expect(xml).toContain('adlcp:scormType="sco"')
  })

  it('escapes XML special characters in the name and description', () => {
    // Only the 2004 manifest carries a description
    const xml = buildManifest({
      ...base,
      courseName: 'Q&A <Basics>',
      courseDescription: '"Quotes" & \'apostrophes\'',
      scormVersion: 'scorm-2004',
    })

    expect(xml).toContain('Q&amp;A &lt;Basics&gt;')
    expect(xml).toContain('&quot;Quotes&quot; &amp; &apos;apostrophes&apos;')
    expect(xml).not.toContain('<Basics>')
  })

  it('falls back to the course name when there is no description', () => {
    const xml = buildManifest({ ...base, scormVersion: 'scorm-2004' })
    expect(xml).toContain('<string language="en-US">Safety Basics</string>')
  })

  it('turns a UUID into a valid XML identifier', () => {
    const xml = buildManifest({ ...base, courseId: '9f1c2b7e-0000-4000-8000-000000000000', scormVersion: 'scorm-1.2' })

    // Identifiers must start with a letter or underscore
    expect(xml).toMatch(/identifier="course_9f1c2b7e-0000-4000-8000-000000000000/)
  })

  it('replaces invalid identifier characters and caps the length', () => {
    const xml = buildManifest({ ...base, courseId: `id with spaces/${'x'.repeat(100)}`, scormVersion: 'scorm-1.2' })
    const id = xml.match(/<manifest[^>]*identifier="([^"]+)"/)?.[1]

    expect(id).toBeDefined()
    expect(id).toMatch(/^[A-Za-z_][\w.-]*$/)
    expect(id!.length).toBeLessThanOrEqual(64)
  })
})
