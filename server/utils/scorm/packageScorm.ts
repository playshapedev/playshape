/**
 * SCORM Package Builder
 *
 * Orchestrates the creation of a SCORM ZIP package by:
 * 1. Querying the course with all activities and templates
 * 2. Building the HTML document
 * 3. Building the manifest
 * 4. Creating the ZIP file
 */

import JSZip from 'jszip'
import { buildCourseHtml, type CourseData, type CourseSection, type CourseActivity, type BrandData } from './buildCourseHtml'
import { buildManifest } from './buildManifest'
import type { ScormVersion } from './courseApiScorm'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PackageOptions {
  scormVersion: ScormVersion
  offline?: boolean
}

export interface CourseExportData {
  course: {
    id: string
    name: string
    description: string | null
    templateId: string | null
  }
  sections: Array<{
    id: string
    title: string | null
    activities: Array<{
      id: string
      name: string
      description: string | null
      data: Record<string, unknown>
      template: {
        id: string
        name: string
        component: string
        inputSchema: unknown[]
        dependencies: Array<{ name: string; url: string; global: string }> | null
      }
    }>
  }>
  interfaceTemplate: {
    id: string
    name: string
    component: string
    inputSchema: unknown[]
    dependencies: Array<{ name: string; url: string; global: string }> | null
  } | null
  brand: BrandData | null
}

// ─── Main Packager ────────────────────────────────────────────────────────────

/**
 * Build a SCORM ZIP package from course export data.
 *
 * @param data - The course data with all sections, activities, templates
 * @param options - SCORM version and offline mode settings
 * @returns A Buffer containing the ZIP file
 */
export async function packageScorm(
  data: CourseExportData,
  options: PackageOptions,
): Promise<Buffer> {
  const { scormVersion, offline } = options

  // Transform the database data into the format expected by buildCourseHtml
  const courseData = transformToCourseData(data)

  // Build the HTML document
  const html = buildCourseHtml({
    course: courseData,
    scormVersion,
    brand: data.brand,
    offline,
  })

  // Build the manifest
  const files = ['index.html']
  // TODO: Add scorm-again.min.js for offline mode
  // TODO: Add vendor scripts for offline mode

  const manifest = buildManifest({
    courseId: data.course.id,
    courseName: data.course.name,
    courseDescription: data.course.description || undefined,
    scormVersion,
    files,
  })

  // Create the ZIP file
  const zip = new JSZip()

  zip.file('imsmanifest.xml', manifest)
  zip.file('index.html', html)

  // TODO: For offline mode, bundle vendor scripts
  // if (offline) {
  //   zip.file('vendor/vue.global.prod.js', await fetchVendorScript('vue'))
  //   zip.file('vendor/tailwind.min.js', await fetchVendorScript('tailwind'))
  //   zip.file('vendor/vue3-sfc-loader.js', await fetchVendorScript('vue3-sfc-loader'))
  // }

  // Generate the ZIP as a Node.js Buffer
  const zipBuffer = await zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 9 },
  })

  return zipBuffer
}

// ─── Data Transformation ──────────────────────────────────────────────────────

/**
 * Transform database export data into the CourseData format expected by buildCourseHtml.
 */
function transformToCourseData(data: CourseExportData): CourseData {
  // Transform sections and activities
  const sections: CourseSection[] = data.sections.map(section => ({
    title: section.title,
    activities: section.activities.map((activity): CourseActivity => ({
      id: activity.id,
      name: activity.name,
      sfc: activity.template.component,
      data: activity.data,
      deps: activity.template.dependencies?.map(dep => ({
        name: dep.name,
        url: dep.url,
        global: dep.global,
      })) || [],
    })),
  }))

  // Get interface template data
  const interfaceSfc = data.interfaceTemplate?.component || null
  const interfaceData: Record<string, unknown> = {
    courseTitle: data.course.name,
  }

  // If the course has an interface template, its data would come from course-level settings
  // For now, we just pass the course title

  const interfaceDeps = data.interfaceTemplate?.dependencies?.map(dep => ({
    name: dep.name,
    url: dep.url,
    global: dep.global,
  })) || []

  return {
    id: data.course.id,
    name: data.course.name,
    sections,
    interfaceSfc,
    interfaceData,
    interfaceDeps,
  }
}

// ─── Utility Functions ────────────────────────────────────────────────────────

/**
 * Get the filename for the exported SCORM package.
 */
export function getPackageFilename(courseName: string, scormVersion: ScormVersion): string {
  // Sanitize the course name for use in a filename
  const safeName = courseName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .substring(0, 50)

  const versionSuffix = scormVersion === 'scorm-1.2' ? 'scorm12' : 'scorm2004'

  return `${safeName}-${versionSuffix}.zip`
}
