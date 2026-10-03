import { describe, it, expect, beforeAll } from 'vitest'
import type { activities, courses, courseSections, objectives, projects, skills } from '~~/server/database/schema'
import { templates } from '~~/server/database/schema'
import { useDb } from '~~/server/utils/db'
import { sampleTemplate } from '../../fixtures/projects'
import { api } from '../utils/api'

type Project = typeof projects.$inferSelect
type Course = typeof courses.$inferSelect
type Section = typeof courseSections.$inferSelect
type Activity = typeof activities.$inferSelect
type Skill = typeof skills.$inferSelect
type Objective = typeof objectives.$inferSelect

interface SkillWithDetails extends Skill {
  objectives: Objective[]
  activities: Array<{ id: string; name: string; courseId: string; courseName: string }>
}

async function createProject(name = 'Skills project') {
  return (await api<Project>('/api/projects', { method: 'POST', body: { name } })).data
}

async function createSkill(projectId: string, name: string) {
  return (await api<Skill>(`/api/projects/${projectId}/skills`, { method: 'POST', body: { name } })).data
}

async function createActivity(projectId: string) {
  const base = `/api/projects/${projectId}/courses`
  const course = (await api<Course>(base, { method: 'POST', body: { name: 'Customer Service 101' } })).data
  const section = (await api<Section>(`${base}/${course.id}/sections`, { method: 'POST', body: { title: 'Week 1' } })).data
  const activity = (await api<Activity>(
    `${base}/${course.id}/sections/${section.id}/activities`,
    { method: 'POST', body: { name: 'Handle a refund request', templateId: sampleTemplate.id } },
  )).data
  return { course, activity, url: `${base}/${course.id}/activities/${activity.id}` }
}

describe('Skills API', () => {
  beforeAll(() => {
    useDb().insert(templates).values(sampleTemplate).run()
  })

  it('creates skills in order and lists them with objectives', async () => {
    const project = await createProject()
    const first = await createSkill(project.id, 'De-escalate an upset customer')
    await createSkill(project.id, 'Process a refund')

    const objective = await api<Objective>(`/api/projects/${project.id}/skills/${first.id}/objectives`, {
      method: 'POST',
      body: { statement: 'Restate the issue', conditions: 'Given a live call', criteria: '' },
    })
    expect(objective.status).toBe(200)
    expect(objective.data.criteria).toBeNull()

    const res = await api<SkillWithDetails[]>(`/api/projects/${project.id}/skills`)

    expect(res.status).toBe(200)
    expect(res.data.map(s => s.name)).toEqual(['De-escalate an upset customer', 'Process a refund'])
    expect(res.data[0]!.objectives.map(o => o.statement)).toEqual(['Restate the issue'])
  })

  it('rejects an empty skill name with 400', async () => {
    const project = await createProject()

    const res = await api(`/api/projects/${project.id}/skills`, { method: 'POST', body: { name: '   ' } })

    expect(res.status).toBe(400)
  })

  it('keeps sort order unique after a skill is deleted', async () => {
    const project = await createProject()
    const a = await createSkill(project.id, 'A')
    await createSkill(project.id, 'B')

    await api(`/api/projects/${project.id}/skills/${a.id}`, { method: 'DELETE' })
    const c = await createSkill(project.id, 'C')

    expect(c.sortOrder).toBe(2)
  })

  it('updates a skill and an objective', async () => {
    const project = await createProject()
    const skill = await createSkill(project.id, 'Old name')
    const objective = (await api<Objective>(`/api/projects/${project.id}/skills/${skill.id}/objectives`, {
      method: 'POST',
      body: { statement: 'Do the thing' },
    })).data

    const renamed = await api<Skill>(`/api/projects/${project.id}/skills/${skill.id}`, {
      method: 'PATCH',
      body: { name: 'New name' },
    })
    const edited = await api<Objective>(`/api/projects/${project.id}/skills/${skill.id}/objectives/${objective.id}`, {
      method: 'PATCH',
      body: { criteria: 'Within 60 seconds' },
    })

    expect(renamed.data.name).toBe('New name')
    expect(edited.data.criteria).toBe('Within 60 seconds')
    expect(edited.data.statement).toBe('Do the thing')
  })

  it('returns 404 for a skill from another project', async () => {
    const owner = await createProject('Owner')
    const other = await createProject('Other')
    const skill = await createSkill(owner.id, 'Private skill')

    const res = await api(`/api/projects/${other.id}/skills/${skill.id}`, { method: 'PATCH', body: { name: 'Hijack' } })

    expect(res.status).toBe(404)
  })

  it('links skills to an activity and shows them on both sides', async () => {
    const project = await createProject()
    const skill = await createSkill(project.id, 'De-escalate')
    const { course, activity, url } = await createActivity(project.id)

    const put = await api<{ skillIds: string[] }>(`${url}/skills`, {
      method: 'PUT',
      body: { skillIds: [skill.id, skill.id] },
    })
    expect(put.status).toBe(200)
    expect(put.data.skillIds).toEqual([skill.id])

    const detail = await api<{ skillIds: string[] }>(url)
    expect(detail.data.skillIds).toEqual([skill.id])

    const list = await api<SkillWithDetails[]>(`/api/projects/${project.id}/skills`)
    expect(list.data[0]!.activities).toEqual([
      { id: activity.id, name: activity.name, courseId: course.id, courseName: course.name },
    ])
  })

  it('rejects linking a skill from another project', async () => {
    const project = await createProject()
    const foreign = await createSkill((await createProject('Other')).id, 'Foreign')
    const { url } = await createActivity(project.id)

    const res = await api(`${url}/skills`, { method: 'PUT', body: { skillIds: [foreign.id] } })

    expect(res.status).toBe(400)
  })

  it('unlinks activities when a skill is deleted', async () => {
    const project = await createProject()
    const skill = await createSkill(project.id, 'Temporary')
    const { url } = await createActivity(project.id)
    await api(`${url}/skills`, { method: 'PUT', body: { skillIds: [skill.id] } })

    const del = await api(`/api/projects/${project.id}/skills/${skill.id}`, { method: 'DELETE' })
    const detail = await api<{ skillIds: string[] }>(url)

    expect(del.status).toBe(204)
    expect(detail.data.skillIds).toEqual([])
  })
})
