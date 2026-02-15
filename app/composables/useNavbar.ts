/**
 * Composable for pages to communicate with the dashboard navbar in the layout.
 *
 * The dashboard layout renders `UDashboardNavbar` and reads the title from the
 * navigation structure. Pages can override the title at runtime (e.g., to show
 * a dynamic entity name like "Customer Service Training" instead of "Project").
 *
 * Pages can also override tabs — the route-based tab links rendered below the
 * navbar. By default, tabs come from the `NavItem.tabs` in the navigation
 * structure. Pages can override or clear them via `setTabs()`.
 *
 * Usage in a page:
 *   const { setTitle, setTabs } = useNavbar()
 *   watch(project, (p) => { if (p) setTitle(p.name) })
 *
 * The layout reads:
 *   const { titleOverride, tabsOverride } = useNavbar()
 */

import type { NavTab } from '~/utils/navigation'

const NAVBAR_TITLE_KEY = 'navbar-title-override' as const
const NAVBAR_TABS_KEY = 'navbar-tabs-override' as const

/**
 * Shared state for the navbar title and tabs overrides.
 * Uses useState so it's shared between the layout and the page within the same
 * Nuxt app instance, and cleared on navigation.
 */
export function useNavbar() {
  const titleOverride = useState<string | null>(NAVBAR_TITLE_KEY, () => null)
  const tabsOverride = useState<NavTab[] | null>(NAVBAR_TABS_KEY, () => null)

  /**
   * Override the navbar title for the current page.
   * Pass `null` to reset to the default from the navigation structure.
   */
  function setTitle(title: string | null) {
    titleOverride.value = title
  }

  /**
   * Override the navbar tabs for the current page.
   * Pass `null` to reset to the default from the navigation structure.
   * Pass an empty array to explicitly hide tabs.
   */
  function setTabs(tabs: NavTab[] | null) {
    tabsOverride.value = tabs
  }

  return {
    /** The current title override (null = use navigation structure default) */
    titleOverride: readonly(titleOverride),
    /** The current tabs override (null = use navigation structure default) */
    tabsOverride: readonly(tabsOverride),
    /** Set or clear the title override */
    setTitle,
    /** Set or clear the tabs override */
    setTabs,
  }
}
