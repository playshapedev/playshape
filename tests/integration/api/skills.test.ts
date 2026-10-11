import { describe, it, expect, beforeAll } from 'vitest'
import { eq } from 'drizzle-orm'
import type { activities, courses, courseSections, projects } from '~~/server/database/schema'
import { objectives, skills, templates } from '~~/server/database/schema'
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

  it('trims a skill description and lets an edit clear it', async () => {
    const project = await createProject()
    const created = await api<Skill>(`/api/projects/${project.id}/skills`, {
      method: 'POST',
      body: { name: 'Coach a peer', description: '  Give useful feedback  ' },
    })
    expect(created.data.description).toBe('Give useful feedback')

    const cleared = await api<Skill>(`/api/projects/${project.id}/skills/${created.data.id}`, {
      method: 'PATCH',
      body: { description: null },
    })

    expect(cleared.status).toBe(200)
    expect(cleared.data.description).toBe('')
  })

  it('deletes an objective', async () => {
    const project = await createProject()
    const skill = await createSkill(project.id, 'Skill')
    const objective = (await api<Objective>(`/api/projects/${project.id}/skills/${skill.id}/objectives`, {
      method: 'POST',
      body: { statement: 'Do the thing' },
    })).data

    const del = await api(`/api/projects/${project.id}/skills/${skill.id}/objectives/${objective.id}`, { method: 'DELETE' })
    const list = await api<SkillWithDetails[]>(`/api/projects/${project.id}/skills`)

    expect(del.status).toBe(204)
    expect(list.data[0]!.objectives).toEqual([])
  })

  it('returns 404 for an objective requested under the wrong skill', async () => {
    const project = await createProject()
    const owner = await createSkill(project.id, 'Owner')
    const other = await createSkill(project.id, 'Other')
    const objective = (await api<Objective>(`/api/projects/${project.id}/skills/${owner.id}/objectives`, {
      method: 'POST',
      body: { statement: 'Do the thing' },
    })).data
    const wrongUrl = `/api/projects/${project.id}/skills/${other.id}/objectives/${objective.id}`

    const patch = await api(wrongUrl, { method: 'PATCH', body: { statement: 'Moved' } })
    const del = await api(wrongUrl, { method: 'DELETE' })

    expect(patch.status).toBe(404)
    expect(del.status).toBe(404)
  })

  it('returns 404 when listing skills for a project that does not exist', async () => {
    const res = await api('/api/projects/missing-project/skills')

    expect(res.status).toBe(404)
  })

  it('removes skills and objectives when their project is deleted', async () => {
    const project = await createProject()
    const skill = await createSkill(project.id, 'Doomed')
    await api(`/api/projects/${project.id}/skills/${skill.id}/objectives`, {
      method: 'POST',
      body: { statement: 'Do the thing' },
    })

    const del = await api(`/api/projects/${project.id}`, { method: 'DELETE' })
    const db = useDb()

    expect(del.status).toBe(204)
    expect(db.select().from(skills).where(eq(skills.id, skill.id)).all()).toEqual([])
    expect(db.select().from(objectives).where(eq(objectives.skillId, skill.id)).all()).toEqual([])
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

  it('returns 404 when linking skills through a different course', async () => {
    const project = await createProject()
    const skill = await createSkill(project.id, 'Skill')
    const { activity } = await createActivity(project.id)
    const otherCourse = (await api<Course>(`/api/projects/${project.id}/courses`, {
      method: 'POST',
      body: { name: 'Other course' },
    })).data

    const res = await api(`/api/projects/${project.id}/courses/${otherCourse.id}/activities/${activity.id}/skills`, {
      method: 'PUT',
      body: { skillIds: [skill.id] },
    })

    expect(res.status).toBe(404)
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
