import { describe, it, expect, beforeAll } from 'vitest'
import JSZip from 'jszip'
import type { courses, courseSections, activities, projects } from '~~/server/database/schema'
import { templates } from '~~/server/database/schema'
import { useDb } from '~~/server/utils/db'
import { sampleTemplate } from '../../fixtures/projects'
import { api } from '../utils/api'

type Project = typeof projects.$inferSelect
type Course = typeof courses.$inferSelect
type Section = typeof courseSections.$inferSelect
type Activity = typeof activities.$inferSelect

// Builds project → course → section → activity through the API, the same
// path the UI takes, so the export test covers the whole chain.
async function createCourseWithActivity() {
  const project = (await api<Project>('/api/projects', { method: 'POST', body: { name: 'Export project' } })).data
  const base = `/api/projects/${project.id}/courses`

  const course = (await api<Course>(base, { method: 'POST', body: { name: 'Customer Service 101' } })).data
  const section = (await api<Section>(`${base}/${course.id}/sections`, { method: 'POST', body: { title: 'Week 1' } })).data
  const activity = await api<Activity>(
    `${base}/${course.id}/sections/${section.id}/activities`,
    { method: 'POST', body: { name: 'Handle a refund request', templateId: sampleTemplate.id } },
  )

  return { project, course, section, activity, base }
}

describe('Course building and SCORM export', () => {
  beforeAll(() => {
    useDb().insert(templates).values(sampleTemplate).run()
  })

  it('creates a course with a default untitled section', async () => {
    const project = (await api<Project>('/api/projects', { method: 'POST', body: { name: 'P' } })).data
    const course = (await api<Course>(`/api/projects/${project.id}/courses`, { method: 'POST', body: { name: 'C' } })).data

    const res = await api<{ sections: Section[] }>(`/api/projects/${project.id}/courses/${course.id}`)

    expect(res.status).toBe(200)
    expect(res.data.sections).toHaveLength(1)
    expect(res.data.sections[0]!.title).toBeNull()
  })

  it('seeds a new activity with its template sample data', async () => {
    const { activity } = await createCourseWithActivity()

    expect(activity.status).toBe(200)
    expect(activity.data.data).toEqual(sampleTemplate.sampleData)
  })

  it('rejects an activity whose template does not exist', async () => {
    const { course, section, base } = await createCourseWithActivity()

    const res = await api(
      `${base}/${course.id}/sections/${section.id}/activities`,
      { method: 'POST', body: { name: 'Orphan', templateId: 'missing-template' } },
    )

    expect(res.status).toBe(404)
  })

  it.each(['scorm-1.2', 'scorm-2004'] as const)('exports a valid %s package', async (format) => {
    const { course, base } = await createCourseWithActivity()

    const res = await api<Buffer>(`${base}/${course.id}/export`, { method: 'POST', body: { format } })

    expect(res.status).toBe(200)
    expect(res.headers.get('content-type')).toBe('application/zip')
    expect(res.headers.get('content-disposition')).toContain('.zip')

    const zip = await JSZip.loadAsync(res.data)
    const manifest = await zip.file('imsmanifest.xml')?.async('string')
    const html = await zip.file('index.html')?.async('string')

    expect(manifest).toContain('Customer Service 101')
    expect(html).toContain('Handle a refund request')
    expect(manifest).toContain(format === 'scorm-1.2'
      ? '<schemaversion>1.2</schemaversion>'
      : '<schemaversion>2004 3rd Edition</schemaversion>')
  })

  it('rejects an unknown export format with 400', async () => {
    const { course, base } = await createCourseWithActivity()
    const res = await api(`${base}/${course.id}/export`, { method: 'POST', body: { format: 'xapi' } })
    expect(res.status).toBe(400)
  })

  it('refuses to export a course with no activities', async () => {
    const project = (await api<Project>('/api/projects', { method: 'POST', body: { name: 'Empty' } })).data
    const course = (await api<Course>(`/api/projects/${project.id}/courses`, { method: 'POST', body: { name: 'Empty' } })).data

    const res = await api(`/api/projects/${project.id}/courses/${course.id}/export`, { method: 'POST', body: { format: 'scorm-1.2' } })

    expect(res.status).toBe(400)
  })

  it('returns 404 when the course belongs to another project', async () => {
    const { course } = await createCourseWithActivity()
    const other = (await api<Project>('/api/projects', { method: 'POST', body: { name: 'Other' } })).data

    const res = await api(`/api/projects/${other.id}/courses/${course.id}/export`, { method: 'POST', body: { format: 'scorm-1.2' } })

    expect(res.status).toBe(404)
  })
})
