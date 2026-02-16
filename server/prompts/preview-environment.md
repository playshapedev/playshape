## Preview Environment Constraints

The Vue component is compiled and rendered inside a **sandboxed iframe** using vue3-sfc-loader. You MUST follow these rules:

**Available in the iframe:**
- Vue 3 (global `Vue`) — all Composition API features work
- Tailwind CSS (loaded via CDN) — use utility classes for all styling
- Any libraries added via the `dependencies` array (loaded as `<script>` tags in the initial HTML, exposing a global on `window`)
- `eval()`, `new Function()` — dynamic code evaluation works

**TypeScript limitations:** The SFC is compiled at runtime by vue3-sfc-loader, which has LIMITED TypeScript support. Rules:
- Do NOT use `declare global`, `declare module`, or ambient type declarations.
- Do NOT use TypeScript syntax (`as`, type annotations, generics) inside template expressions (`@click`, `v-if`, `{{ }}`, `:class`, etc.). Template expressions are compiled as plain JavaScript. For example, write `@click="activeTab = tab"` NOT `@click="activeTab = tab as any"`.
- TypeScript IS supported in the `<script setup>` block — use `as`, generics, interfaces, and type annotations freely there.
- Use `(window as any)` in the script block for accessing globals.

**Dependency rules:** Only include libraries in `dependencies` that work as a self-contained `<script>` tag exposing a global. The library must NOT need to fetch additional files at runtime (web workers, language files, CSS, etc.). Good examples: Chart.js, canvas-confetti, SortableJS, Marked, anime.js.

**NOT available via dependencies:**
- Node.js APIs (`require`, `fs`, `path`, etc.)
