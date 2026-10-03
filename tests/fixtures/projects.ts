/**
 * Test fixtures for database integration tests
 * Provides sample data for testing CRUD operations
 */

import type { InferInsertModel } from 'drizzle-orm'
import { projects, courses, courseSections, activities, templates } from '../../server/database/schema'

// Type definitions for fixtures
export type ProjectInsert = InferInsertModel<typeof projects>
export type CourseInsert = InferInsertModel<typeof courses>
export type CourseSectionInsert = InferInsertModel<typeof courseSections>
export type ActivityInsert = InferInsertModel<typeof activities>
export type TemplateInsert = InferInsertModel<typeof templates>

/**
 * Sample project data for testing
 */
export const sampleProject: ProjectInsert = {
  id: 'test-project-001',
  name: 'Test Project Alpha',
  description: 'A sample project for integration testing',
  createdAt: new Date('2026-01-15T10:00:00Z'),
  updatedAt: new Date('2026-01-15T10:00:00Z'),
}

export const sampleProject2: ProjectInsert = {
  id: 'test-project-002',
  name: 'Test Project Beta',
  description: 'Another sample project for testing multiple records',
  createdAt: new Date('2026-01-20T14:30:00Z'),
  updatedAt: new Date('2026-01-20T14:30:00Z'),
}

/**
 * Sample template data for testing activities
 */
export const sampleTemplate: TemplateInsert = {
  id: 'test-template-001',
  kind: 'activity',
  source: 'user',
  name: 'Test Quiz Template',
  description: 'A simple quiz template for testing',
  inputSchema: [
    {
      id: 'question',
      type: 'text',
      label: 'Question',
      required: true,
    },
    {
      id: 'answer',
      type: 'text',
      label: 'Answer',
      required: true,
    },
  ],
  component: '<template><div>{{ data.question }}</div></template>',
  sampleData: {
    question: 'What is 2+2?',
    answer: '4',
  },
  schemaVersion: 1,
  status: 'published',
  createdAt: new Date('2026-01-10T08:00:00Z'),
  updatedAt: new Date('2026-01-10T08:00:00Z'),
}

/**
 * Sample course data
 */
export const sampleCourse: CourseInsert = {
  id: 'test-course-001',
  projectId: sampleProject.id,
  name: 'Introduction to Testing',
  description: 'Learn the basics of testing with this sample course',
  sortOrder: 0,
  createdAt: new Date('2026-01-16T09:00:00Z'),
  updatedAt: new Date('2026-01-16T09:00:00Z'),
}

/**
 * Sample course section data
 */
export const sampleSection: CourseSectionInsert = {
  id: 'test-section-001',
  courseId: sampleCourse.id,
  title: 'Getting Started',
  sortOrder: 0,
  createdAt: new Date('2026-01-16T09:00:00Z'),
  updatedAt: new Date('2026-01-16T09:00:00Z'),
}

/**
 * Sample activity data
 */
export const sampleActivity: ActivityInsert = {
  id: 'test-activity-001',
  sectionId: sampleSection.id,
  templateId: sampleTemplate.id,
  name: 'Quiz: Basic Math',
  description: 'Test your basic math skills',
  data: {
    question: 'What is 2+2?',
    answer: '4',
  },
  sortOrder: 0,
  dataSchemaVersion: 1,
  totalPromptTokens: 0,
  totalCompletionTokens: 0,
  totalTokens: 0,
  createdAt: new Date('2026-01-16T10:00:00Z'),
  updatedAt: new Date('2026-01-16T10:00:00Z'),
}

/**
 * Factory function to create multiple test projects
 */
export function createTestProjects(count: number): ProjectInsert[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `test-project-${String(i + 1).padStart(3, '0')}`,
    name: `Test Project ${i + 1}`,
    description: `Auto-generated test project ${i + 1}`,
    createdAt: new Date(Date.now() - i * 86400000),
    updatedAt: new Date(Date.now() - i * 86400000),
  }))
}

/**
 * All fixtures bundled together for easy database seeding
 */
export const allFixtures = {
  projects: [sampleProject, sampleProject2],
  templates: [sampleTemplate],
  courses: [sampleCourse],
  sections: [sampleSection],
  activities: [sampleActivity],
}
