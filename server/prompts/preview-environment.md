## Preview Environment Constraints

The Vue component is compiled and rendered inside a **sandboxed iframe** using vue3-sfc-loader. You MUST follow these rules:

**CRITICAL: Use Nuxt UI components for all standard UI elements.** Do not write raw HTML for buttons, cards, inputs, alerts, badges, tabs, forms, or any component that Nuxt UI provides. Raw HTML + Tailwind is only for custom visualizations and game mechanics.

**Available in the iframe:**
- Vue 3 Composition API — `ref`, `computed`, `watch`, `onMounted`, etc. all work
- **Nuxt UI components (USE THESE)** — 100+ components (`<UButton>`, `<UCard>`, `<UInput>`, `<UAlert>`, `<UTabs>`, etc.) dynamically loaded based on usage. No imports needed.
- **Iconify icons** — via `<UIcon name="i-lucide-check" />` or icon props on Nuxt UI components
- Tailwind CSS — for layout (`flex`, `grid`, `space-y-4`) and custom styling, NOT for recreating Nuxt UI components
- Any libraries added via the `dependencies` array (loaded as `<script>` tags exposing a global on `window`)
- `eval()`, `new Function()` — dynamic code evaluation works

**Vue Composition API — IMPORTANT:**
Access Vue's Composition API by **destructuring from the global `Vue` object**, NOT via ES module imports:

```vue
<script setup lang="ts">
// CORRECT — destructure from global Vue
const { ref, computed, watch, onMounted, onUnmounted } = Vue

const count = ref(0)
const doubled = computed(() => count.value * 2)
</script>
```

```vue
<script setup lang="ts">
// WRONG — ES module imports may fail in the preview sandbox
import { ref, computed } from 'vue'  // Don't do this!
</script>
```

Common Vue APIs available on the global `Vue` object: `ref`, `reactive`, `computed`, `watch`, `watchEffect`, `onMounted`, `onUnmounted`, `onBeforeMount`, `onBeforeUnmount`, `nextTick`, `toRef`, `toRefs`, `shallowRef`, `shallowReactive`, `readonly`, `inject`, `provide`.

**Nuxt UI requirements:**
- Components are globally registered — just use `<UButton>`, `<UCard>`, etc. directly
- Load the `nuxt-ui` skill for full component documentation
- **If you're writing more than 5 Tailwind classes for a UI element, you're probably reinventing a Nuxt UI component**

**Icons — IMPORTANT:**
Icons use the `i-{collection}-{name}` format. The collection is typically `lucide` (default) or `heroicons`.

```vue
<!-- UIcon component -->
<UIcon name="i-lucide-check" />
<UIcon name="i-lucide-x" />
<UIcon name="i-lucide-arrow-right" />
<UIcon name="i-lucide-star" />
<UIcon name="i-lucide-heart" />
<UIcon name="i-lucide-settings" />
<UIcon name="i-lucide-user" />
<UIcon name="i-lucide-search" />
<UIcon name="i-lucide-plus" />
<UIcon name="i-lucide-minus" />
<UIcon name="i-lucide-info" />
<UIcon name="i-lucide-alert-triangle" />
<UIcon name="i-lucide-circle-check" />
<UIcon name="i-lucide-circle-x" />

<!-- Icon props on components -->
<UButton icon="i-lucide-plus" label="Add" />
<UButton trailing-icon="i-lucide-arrow-right" label="Next" />
<UAlert icon="i-lucide-info" title="Info" />
<UInput icon="i-lucide-search" placeholder="Search..." />
```

**Common Lucide icons:** `check`, `x`, `plus`, `minus`, `arrow-right`, `arrow-left`, `arrow-up`, `arrow-down`, `chevron-right`, `chevron-left`, `chevron-up`, `chevron-down`, `star`, `heart`, `user`, `users`, `settings`, `search`, `info`, `alert-triangle`, `alert-circle`, `circle-check`, `circle-x`, `eye`, `eye-off`, `edit`, `trash`, `copy`, `download`, `upload`, `refresh-cw`, `loader`, `menu`, `home`, `mail`, `phone`, `calendar`, `clock`, `map-pin`, `link`, `image`, `file`, `folder`, `play`, `pause`, `volume-2`, `mic`, `camera`, `send`, `bookmark`, `flag`, `trophy`, `target`, `zap`, `sparkles`, `lightbulb`, `graduation-cap`, `book-open`, `message-circle`, `thumbs-up`, `thumbs-down`

**DO NOT invent icon names.** If unsure, use a simple icon like `i-lucide-circle` or omit the icon.

**Dark Mode (REQUIRED):**
Templates must work in both light and dark mode. Use semantic color classes instead of hardcoded colors:
- Text: `text-default`, `text-muted`, `text-dimmed`, `text-highlighted` (NOT `text-black`, `text-white`, `text-gray-900`)
- Backgrounds: `bg-default`, `bg-muted`, `bg-elevated` (NOT `bg-white`, `bg-gray-100`)
- Borders: `border-default`, `border-muted` (NOT `border-gray-200`)

Nuxt UI components handle dark mode automatically — another reason to use them.

**TypeScript limitations:** The SFC is compiled at runtime by vue3-sfc-loader, which has LIMITED TypeScript support. Rules:
- Do NOT use `declare global`, `declare module`, or ambient type declarations.
- Do NOT use TypeScript syntax (`as`, type annotations, generics) inside template expressions (`@click`, `v-if`, `{{ }}`, `:class`, etc.). Template expressions are compiled as plain JavaScript. For example, write `@click="activeTab = tab"` NOT `@click="activeTab = tab as any"`.
- TypeScript IS supported in the `<script setup>` block — use `as`, generics, interfaces, and type annotations freely there.
- Use `(window as any)` in the script block for accessing globals.

**Dependency rules:** Only include libraries in `dependencies` that work as a self-contained `<script>` tag exposing a global. The library must NOT need to fetch additional files at runtime (web workers, language files, CSS, etc.). Good examples: Chart.js, canvas-confetti, SortableJS, Marked, anime.js.

**NOT available via dependencies:**
- Node.js APIs (`require`, `fs`, `path`, etc.)
