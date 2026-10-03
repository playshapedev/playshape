/**
 * Navigation structure for the dashboard layout.
 *
 * Defines the hierarchy of pages with their titles and icons. The dashboard
 * layout uses this to render the navbar title and back button automatically.
 * Detail pages (children with `:id` segments) get a back button pointing to
 * their parent.
 *
 * Children can define `tabs` — route-based tab links rendered below the navbar.
 * Each tab maps to a real child route (e.g. `/projects/:id/libraries`).
 *
 * Pages can override the title or tabs at runtime via the `useNavbar()`
 * composable (e.g., to show a project name instead of "Project").
 */

import {
  resolveNavItem as resolveNavItemBase,
  resolveTab as resolveTabBase,
  type NavItem,
  type NavTab,
} from '../../lib/navigation/resolver'

export type { NavItem, NavTab }

export const navigation: NavItem[] = [
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
    path: '/assets',
    title: 'Assets',
    icon: 'i-lucide-image',
    children: [
      { path: '/assets/:id', title: 'Asset' },
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
      { path: 'data', label: 'Data', icon: 'i-lucide-database' },
    ],
  },
]

/**
 * Resolve the nav item matching a given route path.
 * Returns the matched item and its parent (if it's a child page).
 *
 * For items with tabs, also matches tab sub-routes. E.g. '/projects/abc/libraries'
 * matches the '/projects/:id' child and its parent '/projects'.
 */
export function resolveNavItem(routePath: string): { item: NavItem | null, parent: NavItem | null } {
  return resolveNavItemBase(routePath, navigation)
}

/**
 * Find a tab matching a route path within a nav item's tabs.
 * Returns the matching tab or null if no match.
 */
export function resolveTab(routePath: string, parentPath: string, tabs: NavTab[]): NavTab | null {
  return resolveTabBase(routePath, parentPath, tabs)
}
