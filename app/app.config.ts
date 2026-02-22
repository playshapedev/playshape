export default defineAppConfig({
  ui: {
    colors: {
      primary: 'playshape',
      neutral: 'slate',
    },
    toaster: {
      defaultVariants: {
        position: 'top-center' as const,
      },
    },
    dashboardGroup: {
      base: 'dashboard-root',
    },
    input: {
      slots: {
        root: 'relative flex items-center',
      },
    },
    textarea: {
      slots: {
        root: 'relative flex items-center',
      },
    },
    select: {
      slots: {
        base: 'w-full',
      },
    },
    selectMenu: {
      slots: {
        base: 'w-full',
      },
    },
  },
})
