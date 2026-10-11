import type { skills, objectives } from '~~/server/database/schema'

type Skill = typeof skills.$inferSelect
type Objective = typeof objectives.$inferSelect

export interface SkillActivity {
  id: string
  name: string
  courseId: string
  courseName: string
}

export interface SkillWithDetails extends Skill {
  objectives: Objective[]
  activities: SkillActivity[]
}

export interface ObjectiveInput {
  statement: string
  conditions?: string | null
  criteria?: string | null
}

// ─── List skills for a project ───────────────────────────────────────────────

export function useProjectSkills(projectId: MaybeRef<string>) {
  const resolvedId = toRef(projectId)
  const { data, pending, error, refresh } = useFetch<SkillWithDetails[]>(
    () => `/api/projects/${resolvedId.value}/skills`,
  )
  return { skills: data, pending, error, refresh }
}

// ─── Skill CRUD ──────────────────────────────────────────────────────────────

export async function createSkill(projectId: string, data: { name: string; description?: string }) {
  return $fetch<Skill>(`/api/projects/${projectId}/skills`, {
    method: 'POST',
    body: data,
  })
}

export async function updateSkill(
  projectId: string,
  skillId: string,
  data: { name?: string; description?: string; sortOrder?: number },
) {
  return $fetch<Skill>(`/api/projects/${projectId}/skills/${skillId}`, {
    method: 'PATCH',
    body: data,
  })
}

export async function deleteSkill(projectId: string, skillId: string) {
  return $fetch(`/api/projects/${projectId}/skills/${skillId}`, {
    method: 'DELETE',
  })
}

// ─── Objective CRUD ──────────────────────────────────────────────────────────

export async function createObjective(projectId: string, skillId: string, data: ObjectiveInput) {
  return $fetch<Objective>(`/api/projects/${projectId}/skills/${skillId}/objectives`, {
    method: 'POST',
    body: data,
  })
}

export async function updateObjective(
  projectId: string,
  skillId: string,
  objectiveId: string,
  data: Partial<ObjectiveInput> & { sortOrder?: number },
) {
  return $fetch<Objective>(`/api/projects/${projectId}/skills/${skillId}/objectives/${objectiveId}`, {
    method: 'PATCH',
    body: data,
  })
}

export async function deleteObjective(projectId: string, skillId: string, objectiveId: string) {
  return $fetch(`/api/projects/${projectId}/skills/${skillId}/objectives/${objectiveId}`, {
    method: 'DELETE',
  })
}

// ─── Activity ↔ Skill links ──────────────────────────────────────────────────

export async function setActivitySkills(
  projectId: string,
  courseId: string,
  activityId: string,
  skillIds: string[],
) {
  return $fetch<{ activityId: string; skillIds: string[] }>(
    `/api/projects/${projectId}/courses/${courseId}/activities/${activityId}/skills`,
    { method: 'PUT', body: { skillIds } },
  )
}
