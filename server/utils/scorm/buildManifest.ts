/**
 * SCORM Manifest Generator
 *
 * Generates the imsmanifest.xml file for SCORM 1.2 and SCORM 2004 packages.
 * For single-SCO packages, the manifest is straightforward — one organization
 * with one item pointing to index.html.
 */

import type { ScormVersion } from './courseApiScorm'

export interface ManifestOptions {
  courseId: string
  courseName: string
  courseDescription?: string
  scormVersion: ScormVersion
  /** List of files in the package (relative paths) */
  files: string[]
}

/**
 * Generate the imsmanifest.xml content for a SCORM package.
 */
export function buildManifest(options: ManifestOptions): string {
  const { courseId, courseName, courseDescription, scormVersion, files } = options

  // Sanitize the course ID for use as an XML identifier
  const safeId = sanitizeIdentifier(courseId)
  const safeName = escapeXml(courseName)
  const safeDescription = courseDescription ? escapeXml(courseDescription) : safeName

  if (scormVersion === 'scorm-1.2') {
    return buildScorm12Manifest(safeId, safeName, safeDescription, files)
  }
  else {
    return buildScorm2004Manifest(safeId, safeName, safeDescription, files)
  }
}

/**
 * Generate SCORM 1.2 manifest
 */
function buildScorm12Manifest(
  courseId: string,
  courseName: string,
  courseDescription: string,
  files: string[],
): string {
  const fileElements = files
    .map(f => `        <file href="${escapeXml(f)}"/>`)
    .join('\n')

  return `<?xml version="1.0" encoding="UTF-8"?>
<manifest identifier="${courseId}"
  version="1.0"
  xmlns="http://www.imsproject.org/xsd/imscp_rootv1p1p2"
  xmlns:adlcp="http://www.adlnet.org/xsd/adlcp_rootv1p2"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xsi:schemaLocation="http://www.imsproject.org/xsd/imscp_rootv1p1p2 imscp_rootv1p1p2.xsd
                      http://www.adlnet.org/xsd/adlcp_rootv1p2 adlcp_rootv1p2.xsd">

  <metadata>
    <schema>ADL SCORM</schema>
    <schemaversion>1.2</schemaversion>
  </metadata>

  <organizations default="${courseId}-org">
    <organization identifier="${courseId}-org">
      <title>${courseName}</title>
      <item identifier="${courseId}-item" identifierref="${courseId}-resource" isvisible="true">
        <title>${courseName}</title>
        <adlcp:masteryscore>70</adlcp:masteryscore>
      </item>
    </organization>
  </organizations>

  <resources>
    <resource identifier="${courseId}-resource"
      type="webcontent"
      adlcp:scormtype="sco"
      href="index.html">
${fileElements}
    </resource>
  </resources>

</manifest>`
}

/**
 * Generate SCORM 2004 3rd Edition manifest
 */
function buildScorm2004Manifest(
  courseId: string,
  courseName: string,
  courseDescription: string,
  files: string[],
): string {
  const fileElements = files
    .map(f => `        <file href="${escapeXml(f)}"/>`)
    .join('\n')

  return `<?xml version="1.0" encoding="UTF-8"?>
<manifest identifier="${courseId}"
  version="1.0"
  xmlns="http://www.imsglobal.org/xsd/imscp_v1p1"
  xmlns:adlcp="http://www.adlnet.org/xsd/adlcp_v1p3"
  xmlns:adlseq="http://www.adlnet.org/xsd/adlseq_v1p3"
  xmlns:adlnav="http://www.adlnet.org/xsd/adlnav_v1p3"
  xmlns:imsss="http://www.imsglobal.org/xsd/imsss"
  xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
  xsi:schemaLocation="http://www.imsglobal.org/xsd/imscp_v1p1 imscp_v1p1.xsd
                      http://www.adlnet.org/xsd/adlcp_v1p3 adlcp_v1p3.xsd
                      http://www.adlnet.org/xsd/adlseq_v1p3 adlseq_v1p3.xsd
                      http://www.adlnet.org/xsd/adlnav_v1p3 adlnav_v1p3.xsd
                      http://www.imsglobal.org/xsd/imsss imsss_v1p0.xsd">

  <metadata>
    <schema>ADL SCORM</schema>
    <schemaversion>2004 3rd Edition</schemaversion>
    <lom xmlns="http://ltsc.ieee.org/xsd/LOM">
      <general>
        <title>
          <string language="en-US">${courseName}</string>
        </title>
        <description>
          <string language="en-US">${courseDescription}</string>
        </description>
      </general>
    </lom>
  </metadata>

  <organizations default="${courseId}-org">
    <organization identifier="${courseId}-org" structure="hierarchical">
      <title>${courseName}</title>
      <item identifier="${courseId}-item" identifierref="${courseId}-resource" isvisible="true">
        <title>${courseName}</title>
        <imsss:sequencing>
          <imsss:deliveryControls completionSetByContent="true" objectiveSetByContent="true"/>
        </imsss:sequencing>
      </item>
      <imsss:sequencing>
        <imsss:controlMode choice="true" flow="true"/>
      </imsss:sequencing>
    </organization>
  </organizations>

  <resources>
    <resource identifier="${courseId}-resource"
      type="webcontent"
      adlcp:scormType="sco"
      href="index.html">
${fileElements}
    </resource>
  </resources>

</manifest>`
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Sanitize a string for use as an XML identifier.
 * Must start with a letter or underscore, contain only letters, digits, hyphens, underscores, periods.
 */
function sanitizeIdentifier(str: string): string {
  // Replace invalid characters with underscores
  let safe = str.replace(/[^a-zA-Z0-9_\-\.]/g, '_')

  // Ensure it starts with a letter or underscore
  if (!/^[a-zA-Z_]/.test(safe)) {
    safe = 'course_' + safe
  }

  // Limit length
  if (safe.length > 64) {
    safe = safe.substring(0, 64)
  }

  return safe
}

/**
 * Escape special XML characters.
 */
function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}
