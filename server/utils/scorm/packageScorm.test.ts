import { describe, it, expect } from 'vitest'
import JSZip from 'jszip'
import { packageScorm, getPackageFilename, type CourseExportData } from './packageScorm'

function exportData(overrides: Partial<CourseExportData> = {}): CourseExportData {
  return {
    course: { id: 'course-1', name: 'Conflict Resolution', description: 'Practice de-escalation', templateId: null },
    sections: [{
      id: 'section-1',
      title: 'Week 1',
      activities: [{
        id: 'activity-1',
        name: 'Angry customer',
        description: null,
        data: { prompt: 'The customer is upset about a late delivery.' },
        template: {
          id: 'template-1',
          name: 'Role-play',
          component: '<template><div>{{ data.prompt }}</div></template>',
          inputSchema: [],
          dependencies: [{ name: 'chart', url: 'https://cdn.example.com/chart.js', global: 'Chart' }],
        },
      }],
    }],
    interfaceTemplate: null,
    brand: null,
    ...overrides,
  }
}

async function unzip(buffer: Buffer) {
  const zip = await JSZip.loadAsync(buffer)
  return {
    files: Object.keys(zip.files).sort(),
    manifest: await zip.file('imsmanifest.xml')!.async('string'),
    html: await zip.file('index.html')!.async('string'),
  }
}

describe('packageScorm', () => {
  it.each(['scorm-1.2', 'scorm-2004'] as const)('produces a %s zip with a manifest and launch page', async (scormVersion) => {
    const pkg = await unzip(await packageScorm(exportData(), { scormVersion }))

    expect(pkg.files).toEqual(['imsmanifest.xml', 'index.html'])
    expect(pkg.manifest).toContain('Conflict Resolution')
    expect(pkg.html).toContain('<title>Conflict Resolution</title>')
  })

  it('embeds activity data, names and template code in the page', async () => {
    const { html } = await unzip(await packageScorm(exportData(), { scormVersion: 'scorm-1.2' }))

    expect(html).toContain('Angry customer')
    expect(html).toContain('The customer is upset about a late delivery.')
    expect(html).toContain('{{ data.prompt }}')
  })

  it('loads each template dependency once', async () => {
    const data = exportData()
    data.sections.push({ ...data.sections[0]!, id: 'section-2' })

    const { html } = await unzip(await packageScorm(data, { scormVersion: 'scorm-1.2' }))

    expect(html.match(/<script src="https:\/\/cdn\.example\.com\/chart\.js"><\/script>/g)).toHaveLength(1)
  })

  it('cannot be broken out of by content that contains a closing script tag', async () => {
    const data = exportData()
    data.course.name = '</title><script>alert(1)</script>'
    data.sections[0]!.activities[0]!.data = { prompt: '</script><script>alert(2)</script>' }

    const { html } = await unzip(await packageScorm(data, { scormVersion: 'scorm-1.2' }))

    expect(html).not.toContain('alert(1)</script>')
    expect(html).not.toContain('<script>alert(2)')
    expect(html).toContain('&lt;/title&gt;&lt;script&gt;alert(1)')
  })

  it('applies the brand colors when a brand is set', async () => {
    const brand = {
      primaryColor: '#3366ff',
      neutralColor: '#64748b',
      accentColor: '#f59e0b',
      fontFamily: 'Inter',
      fontSource: 'google' as const,
      baseFontSize: 16,
      typeScaleRatio: '1.25',
      borderRadius: '0.5',
    }

    const { html } = await unzip(await packageScorm(exportData({ brand }), { scormVersion: 'scorm-1.2' }))

    expect(html).toContain('fonts.googleapis.com')
    expect(html).toContain('--ui-color-primary-500')
    expect(html).toContain('--ui-radius: 0.5rem;')
  })
})

describe('getPackageFilename', () => {
  it('slugifies the course name and tags the SCORM version', () => {
    expect(getPackageFilename('Conflict Resolution: Part 1!', 'scorm-1.2')).toBe('conflict-resolution-part-1-scorm12.zip')
    expect(getPackageFilename('Conflict Resolution', 'scorm-2004')).toBe('conflict-resolution-scorm2004.zip')
  })

  it('truncates very long names', () => {
    const name = getPackageFilename('a'.repeat(200), 'scorm-1.2').replace('-scorm12.zip', '')
    expect(name.length).toBe(50)
  })
})
