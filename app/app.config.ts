export default defineAppConfig({
  ui: {
    colors: {
      primary: 'playshape',
      neutral: 'slate',
    },
    dashboardNavbar: {
      slots: {
        root: 'electron-titlebar',
      },
    },
  },
})
