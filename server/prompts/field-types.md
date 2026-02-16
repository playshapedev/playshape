The template has these parts:
   - **fields**: An array of field definitions that describe what data the template needs. Available field types:
     - `text` — Single-line text input. Supports `placeholder` and `default`.
     - `textarea` — Multi-line text input. Supports `placeholder` and `default`.
     - `dropdown` — Select from predefined options. Requires `options` array of strings. Supports `default`.
     - `checkbox` — Boolean toggle. Supports `default`.
     - `number` — Numeric input. Supports `min`, `max`, and `default`.
     - `color` — Color picker with hex value. Supports `default`.
     - `array` — A repeatable list of items. Requires `fields` (sub-field definitions for each item). Use this for lists of structured data. Array fields can be nested (arrays within arrays).
     The `default` property on fields defines the initial value when a user creates something from this template. It is NOT for example/preview data — that goes in `sampleData`.
   - **component**: A Vue 3 Single File Component (SFC) using `<script setup>` and the Composition API. The component receives a `data` prop containing the filled-in values from the input schema. Use clean, modern Vue 3 patterns. Style with Tailwind CSS utility classes. The component should be self-contained and work standalone.
   - **sampleData**: A complete data object with realistic example content, used to preview the template. Keys must match the field IDs from the `fields` array. For array fields, include 2-3 representative items with meaningful content so the preview looks realistic. This is separate from field `default` values — sampleData is for previewing, defaults are for new creation.
   - **dependencies** (optional): An array of external libraries to load via CDN in the preview iframe. Each entry has:
     - `name` — The package name (e.g., `"chart.js"`, `"canvas-confetti"`)
     - `url` — A CDN URL for the library (prefer jsdelivr: `https://cdn.jsdelivr.net/npm/<package>@<version>`)
     - `global` — The global variable name the script exposes (e.g., `"Chart"`, `"confetti"`)
     The component can then use `window.<global>` to access the library. Only include dependencies when the component genuinely needs a third-party library (charts, animations, drag-and-drop, etc.). Common libraries and their globals:
     - Chart.js: `{ name: "chart.js", url: "https://cdn.jsdelivr.net/npm/chart.js@4", global: "Chart" }`
     - canvas-confetti: `{ name: "canvas-confetti", url: "https://cdn.jsdelivr.net/npm/canvas-confetti@1", global: "confetti" }`
     - SortableJS: `{ name: "sortablejs", url: "https://cdn.jsdelivr.net/npm/sortablejs@1", global: "Sortable" }`
     - anime.js: `{ name: "animejs", url: "https://cdn.jsdelivr.net/npm/animejs@3", global: "anime" }`
     - Marked (Markdown): `{ name: "marked", url: "https://cdn.jsdelivr.net/npm/marked@12", global: "marked" }`
