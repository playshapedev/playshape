import type { courses, courseSections, activities, TemplateField, TemplateDependency } from '~~/server/database/schema'

type Course = typeof courses.$inferSelect
type CourseSection = typeof courseSections.$inferSelect
type Activity = typeof activities.$inferSelect

export interface CourseListItem extends Course {
  templateName: string | null
  activityCount: number
}

export interface ActivityListItem {
  id: string
  sectionId: string
  templateId: string
  name: string
  description: string | null
  sortOrder: number
  createdAt: Date
  updatedAt: Date
  templateName: string | null
}

export interface CourseSectionWithActivities extends CourseSection {
  activities: ActivityListItem[]
}

export interface CourseDetail extends Omit<Course, 'projectId'> {
  projectId: string
  templateName: string | null
  sections: CourseSectionWithActivities[]
}

export interface ActivityDetail extends Activity {
  template: {
    id: string
    name: string
    description: string | null
    inputSchema: TemplateField[] | null
    component: string | null
    sampleData: Record<string, unknown> | null
    dependencies: TemplateDependency[] | null
    tools: string[] | null
    status: string
    schemaVersion: number
    latestSchemaVersion?: number
    upgradeAvailable: boolean
  } | null
}

// ─── List courses for a project ──────────────────────────────────────────────

export function useProjectCourses(projectId: MaybeRef<string>) {
  const resolvedId = toRef(projectId)
  const { data, pending, error, refresh } = useFetch<CourseListItem[]>(
    () => `/api/projects/${resolvedId.value}/courses`,
  )
  return { courses: data, pending, error, refresh }
}

// ─── Single course with sections ─────────────────────────────────────────────

/** Generate the cache key for a course's data */
export function getCourseKey(projectId: string, courseId: string) {
  return `course:${projectId}:${courseId}`
}

export function useCourse(projectId: MaybeRef<string>, courseId: MaybeRef<string>) {
  const resolvedProjectId = toRef(projectId)
  const resolvedCourseId = toRef(courseId)
  const key = getCourseKey(toValue(projectId), toValue(courseId))
  const { data, pending, error, refresh } = useFetch<CourseDetail>(
    () => `/api/projects/${resolvedProjectId.value}/courses/${resolvedCourseId.value}`,
    { key },
  )
  return { course: data, pending, error, refresh }
}

// ─── Course CRUD ─────────────────────────────────────────────────────────────

export async function createCourse(
  projectId: string,
  data: { name: string; description?: string | null; templateId?: string | null },
) {
  return $fetch<Course>(`/api/projects/${projectId}/courses`, {
    method: 'POST',
    body: data,
  })
}

export async function updateCourse(
  projectId: string,
  courseId: string,
  data: { name?: string; description?: string | null; templateId?: string | null },
) {
  return $fetch<Course>(`/api/projects/${projectId}/courses/${courseId}`, {
    method: 'PATCH',
    body: data,
  })
}

export async function deleteCourse(projectId: string, courseId: string) {
  return $fetch(`/api/projects/${projectId}/courses/${courseId}`, {
    method: 'DELETE',
  })
}

// ─── Section CRUD ────────────────────────────────────────────────────────────

export async function createSection(
  projectId: string,
  courseId: string,
  data?: { title?: string | null },
) {
  return $fetch<CourseSection>(`/api/projects/${projectId}/courses/${courseId}/sections`, {
    method: 'POST',
    body: data ?? {},
  })
}

export async function updateSection(
  projectId: string,
  courseId: string,
  sectionId: string,
  data: { title?: string | null; sortOrder?: number },
) {
  return $fetch<CourseSection>(`/api/projects/${projectId}/courses/${courseId}/sections/${sectionId}`, {
    method: 'PATCH',
    body: data,
  })
}

export async function deleteSection(
  projectId: string,
  courseId: string,
  sectionId: string,
) {
  return $fetch(`/api/projects/${projectId}/courses/${courseId}/sections/${sectionId}`, {
    method: 'DELETE',
  })
}

export async function reorderSections(
  projectId: string,
  courseId: string,
  sectionIds: string[],
) {
  return $fetch(`/api/projects/${projectId}/courses/${courseId}/reorder`, {
    method: 'PATCH',
    body: { sectionIds },
  })
}

// ─── Activity CRUD ───────────────────────────────────────────────────────────

export function useActivity(projectId: MaybeRef<string>, courseId: MaybeRef<string>, activityId: MaybeRef<string>) {
  const pId = toRef(projectId)
  const cId = toRef(courseId)
  const aId = toRef(activityId)
  const { data, pending, error, refresh } = useFetch<ActivityDetail>(
    () => `/api/projects/${pId.value}/courses/${cId.value}/activities/${aId.value}`,
  )
  return { activity: data, pending, error, refresh }
}

export async function createActivity(
  projectId: string,
  courseId: string,
  sectionId: string,
  data: { name: string; templateId: string; description?: string | null },
) {
  return $fetch<Activity>(`/api/projects/${projectId}/courses/${courseId}/sections/${sectionId}/activities`, {
    method: 'POST',
    body: data,
  })
}

export async function updateActivity(
  projectId: string,
  courseId: string,
  activityId: string,
  data: { name?: string; description?: string | null; data?: Record<string, unknown>; messages?: unknown[] },
) {
  return $fetch<Activity>(`/api/projects/${projectId}/courses/${courseId}/activities/${activityId}`, {
    method: 'PATCH',
    body: data,
  })
}

export async function deleteActivity(
  projectId: string,
  courseId: string,
  activityId: string,
) {
  return $fetch(`/api/projects/${projectId}/courses/${courseId}/activities/${activityId}`, {
    method: 'DELETE',
  })
}
