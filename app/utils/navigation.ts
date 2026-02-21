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

export interface NavTab {
  /** Route path segment appended to the parent (empty string = index route) */
  path: string
  /** Display label */
  label: string
  /** Optional icon */
  icon?: string
}

export interface NavItem {
  /** Route path pattern (e.g. '/projects', '/projects/:id') */
  path: string
  /** Default title shown in the navbar */
  title: string
  /** Icon displayed next to the title */
  icon?: string
  /** Nested pages — detail/sub pages under this section */
  children?: NavItem[]
  /** Route-based tabs rendered below the navbar */
  tabs?: NavTab[]
}

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
  for (const item of navigation) {
    // Exact match on top-level
    if (routePath === item.path) {
      return { item, parent: null }
    }

    // Top-level items with tabs: match tab sub-routes
    // e.g. '/settings/providers' matches '/settings' with tabs
    if (item.tabs?.length) {
      const regex = new RegExp(`^${item.path}/.+$`)
      if (regex.test(routePath)) {
        return { item, parent: null }
      }
    }

    // Check children
    if (item.children) {
      for (const child of item.children) {
        // Match dynamic segments: '/projects/:id' matches '/projects/abc-123'
        // Also match tab sub-routes: '/projects/:id/libraries' matches '/projects/abc-123/libraries'
        const pattern = child.path.replace(/:[\w]+/g, '[^/]+')
        const regex = new RegExp(`^${pattern}(/.*)?$`)
        if (regex.test(routePath)) {
          return { item: child, parent: item }
        }
      }
    }
  }

  return { item: null, parent: null }
}
