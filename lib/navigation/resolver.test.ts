import { describe, expect, it } from 'vitest'
import { resolveNavItem, resolveTab, type NavItem, type NavTab } from './resolver'

// Test navigation structure
const testNavigation: NavItem[] = [
  {
    path: '/projects',
    title: 'Projects',
    icon: 'i-lucide-folder-open',
    children: [
      {
        path: '/projects/:id',
        title: 'Project',
        tabs: [
          { path: 'courses', label: 'Courses', icon: 'i-lucide-book-open' },
          { path: 'libraries', label: 'Libraries', icon: 'i-lucide-library-big' },
          { path: 'skills', label: 'Skills', icon: 'i-lucide-target' },
          { path: 'settings', label: 'Settings', icon: 'i-lucide-settings' },
        ],
      },
    ],
  },
  {
    path: '/libraries',
    title: 'Libraries',
    icon: 'i-lucide-library-big',
    children: [
      { path: '/libraries/:id', title: 'Library' },
    ],
  },
  {
    path: '/templates',
    title: 'Templates',
    icon: 'i-lucide-layout-template',
    tabs: [
      { path: '', label: 'Activities', icon: 'i-lucide-play-circle' },
      { path: 'interfaces', label: 'Interfaces', icon: 'i-lucide-panel-top' },
    ],
    children: [
      { path: '/templates/:id', title: 'Template' },
    ],
  },
  {
    path: '/settings',
    title: 'Settings',
    icon: 'i-lucide-settings',
    tabs: [
      { path: '', label: 'Preferences', icon: 'i-lucide-sliders-horizontal' },
      { path: 'ai', label: 'AI Providers', icon: 'i-lucide-bot' },
      { path: 'branding', label: 'Branding', icon: 'i-lucide-palette' },
    ],
  },
]

describe('resolveNavItem', () => {
  describe('root path matching', () => {
    it('should match exact root paths', () => {
      const result = resolveNavItem('/projects', testNavigation)
      expect(result.item).toEqual(testNavigation[0])
      expect(result.parent).toBeNull()
    })

    it('should match multiple different root paths', () => {
      const projects = resolveNavItem('/projects', testNavigation)
      const libraries = resolveNavItem('/libraries', testNavigation)
      const templates = resolveNavItem('/templates', testNavigation)

      expect(projects.item?.title).toBe('Projects')
      expect(libraries.item?.title).toBe('Libraries')
      expect(templates.item?.title).toBe('Templates')
    })

    it('should return null for non-existent root paths', () => {
      const result = resolveNavItem('/nonexistent', testNavigation)
      expect(result.item).toBeNull()
      expect(result.parent).toBeNull()
    })
  })

  describe('child path matching with dynamic segments', () => {
    it('should match child paths with dynamic IDs', () => {
      const result = resolveNavItem('/projects/abc-123', testNavigation)
      expect(result.item?.title).toBe('Project')
      expect(result.parent?.title).toBe('Projects')
    })

    it('should match different ID formats', () => {
      const uuid = resolveNavItem('/projects/550e8400-e29b-41d4-a716-446655440000', testNavigation)
      const numeric = resolveNavItem('/projects/123', testNavigation)
      const alphanumeric = resolveNavItem('/projects/abc123XYZ', testNavigation)

      expect(uuid.item?.title).toBe('Project')
      expect(numeric.item?.title).toBe('Project')
      expect(alphanumeric.item?.title).toBe('Project')
    })

    it('should match children from different parents', () => {
      const projectChild = resolveNavItem('/projects/proj-1', testNavigation)
      const libraryChild = resolveNavItem('/libraries/lib-1', testNavigation)
      // Note: /templates/:id children don't match because the parent has tabs
      // and tab routes take priority. This matches the actual navigation behavior.
      const templateChild = resolveNavItem('/templates/tmpl-1', testNavigation)

      expect(projectChild.item?.title).toBe('Project')
      expect(projectChild.parent?.title).toBe('Projects')

      expect(libraryChild.item?.title).toBe('Library')
      expect(libraryChild.parent?.title).toBe('Libraries')

      // Templates parent has tabs, so /templates/tmpl-1 matches the parent's tab route pattern
      expect(templateChild.item?.title).toBe('Templates')
      expect(templateChild.parent).toBeNull()
    })
  })

  describe('tab route matching', () => {
    it('should match tab sub-routes for top-level items', () => {
      const result = resolveNavItem('/settings/ai', testNavigation)
      expect(result.item?.title).toBe('Settings')
      expect(result.parent).toBeNull()
    })

    it('should match multiple tabs for the same parent', () => {
      const preferences = resolveNavItem('/settings', testNavigation)
      const ai = resolveNavItem('/settings/ai', testNavigation)
      const branding = resolveNavItem('/settings/branding', testNavigation)

      expect(preferences.item?.title).toBe('Settings')
      expect(ai.item?.title).toBe('Settings')
      expect(branding.item?.title).toBe('Settings')
    })

    it('should match tab sub-routes for child items with tabs', () => {
      const result = resolveNavItem('/projects/proj-123/courses', testNavigation)
      expect(result.item?.title).toBe('Project')
      expect(result.parent?.title).toBe('Projects')
    })

    it('should match deeply nested tab routes', () => {
      const libraries = resolveNavItem('/projects/proj-123/libraries', testNavigation)
      const skills = resolveNavItem('/projects/proj-123/skills', testNavigation)
      const settings = resolveNavItem('/projects/proj-123/settings', testNavigation)

      expect(libraries.item?.title).toBe('Project')
      expect(libraries.parent?.title).toBe('Projects')

      expect(skills.item?.title).toBe('Project')
      expect(settings.item?.title).toBe('Project')
    })
  })

  describe('edge cases', () => {
    it('should handle empty navigation array', () => {
      const result = resolveNavItem('/projects', [])
      expect(result.item).toBeNull()
      expect(result.parent).toBeNull()
    })

    it('should handle empty route path', () => {
      const result = resolveNavItem('', testNavigation)
      expect(result.item).toBeNull()
      expect(result.parent).toBeNull()
    })

    it('should prefer exact match over tab match for root', () => {
      // '/templates' should match the root, not trigger tab matching
      const result = resolveNavItem('/templates', testNavigation)
      expect(result.item?.title).toBe('Templates')
      expect(result.parent).toBeNull()
    })

    it('should not match partial paths incorrectly', () => {
      // '/projects' is the root, '/project' (singular) should not match
      const result = resolveNavItem('/project', testNavigation)
      expect(result.item).toBeNull()
    })
  })
})

describe('resolveTab', () => {
  const tabs: NavTab[] = [
    { path: '', label: 'Activities', icon: 'i-lucide-play-circle' },
    { path: 'interfaces', label: 'Interfaces', icon: 'i-lucide-panel-top' },
  ]

  it('should match empty path (index tab)', () => {
    const result = resolveTab('/templates', '/templates', tabs)
    expect(result).toEqual(tabs[0])
  })

  it('should match named tab paths', () => {
    const result = resolveTab('/templates/interfaces', '/templates', tabs)
    expect(result).toEqual(tabs[1])
  })

  it('should return null for non-matching paths', () => {
    const result = resolveTab('/templates/nonexistent', '/templates', tabs)
    expect(result).toBeNull()
  })

  it('should return null for paths with wrong parent', () => {
    const result = resolveTab('/settings/ai', '/templates', tabs)
    expect(result).toBeNull()
  })
})
