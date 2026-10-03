// @ts-check
import withNuxt from './.nuxt/eslint.config.mjs'

export default withNuxt(
  {
    // Many pages render a root element plus a sibling (e.g. a modal). That's
    // fine without page transitions, so surface it as a warning, not a CI failure.
    files: ['app/pages/**/*.vue'],
    rules: {
      'vue/no-multiple-template-root': 'warn',
    },
  },
)
