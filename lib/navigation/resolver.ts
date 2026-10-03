/**
 * Navigation resolver logic - pure functions for route matching
 *
 * This module contains pure business logic for resolving navigation items
 * from route paths. It has no dependencies on Nuxt, Vue, or the DOM.
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

/**
 * Resolve the nav item matching a given route path.
 * Returns the matched item and its parent (if it's a child page).
 *
 * For items with tabs, also matches tab sub-routes. E.g. '/projects/abc/libraries'
 * matches the '/projects/:id' child and its parent '/projects'.
 */
export function resolveNavItem(
  routePath: string,
  navigation: NavItem[]
): { item: NavItem | null; parent: NavItem | null } {
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

/**
 * Find a tab matching a route path within a nav item's tabs.
 * Returns the matching tab or null if no match.
 */
export function resolveTab(
  routePath: string,
  parentPath: string,
  tabs: NavTab[]
): NavTab | null {
  for (const tab of tabs) {
    const expectedPath = tab.path === ''
      ? parentPath
      : `${parentPath}/${tab.path}`
    if (routePath === expectedPath) {
      return tab
    }
  }
  return null
}
