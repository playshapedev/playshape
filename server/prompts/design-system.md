## Design System

The preview iframe loads **Tailwind CSS v3 via CDN**, so the full standard Tailwind utility class library is available. In addition, the iframe's Tailwind config extends with custom design tokens (CSS custom properties) that map to semantic utilities for colors, backgrounds, borders, and border radius. Using these tokens ensures components look consistent with the host app's theme and respond correctly to light/dark mode and brand overrides.

### Standard Tailwind (all available)

Every built-in Tailwind v3 utility class works in the preview iframe. This includes:

- **Layout:** `flex`, `grid`, `block`, `inline`, `hidden`, `container`, `absolute`, `relative`, `fixed`, `sticky`, `z-*`, `overflow-*`
- **Flexbox & Grid:** `flex-col`, `flex-row`, `items-center`, `justify-between`, `gap-*`, `grid-cols-*`, `col-span-*`, `flex-1`, `flex-wrap`, `shrink-0`, `grow`, `order-*`, `self-*`, `place-*`
- **Spacing:** `p-*`, `px-*`, `py-*`, `pt-*`, `m-*`, `mx-auto`, `space-x-*`, `space-y-*`
- **Sizing:** `w-*`, `h-*`, `min-w-*`, `min-h-*`, `max-w-*`, `max-h-*`, `size-*`, `aspect-*`
- **Typography:** `text-xs`, `text-sm`, `text-base`, `text-lg`, `text-xl`, `text-2xl`–`text-9xl`, `font-light`, `font-normal`, `font-medium`, `font-semibold`, `font-bold`, `leading-*`, `tracking-*`, `uppercase`, `lowercase`, `capitalize`, `truncate`, `line-clamp-*`, `whitespace-*`, `break-*`, `italic`, `underline`, `line-through`, `text-left`, `text-center`, `text-right`
- **Standard colors:** All Tailwind color palettes are available — `text-red-500`, `bg-blue-100`, `border-green-300`, `text-gray-700`, `bg-yellow-50`, `text-emerald-600`, `bg-amber-200`, `text-rose-500`, `bg-indigo-100`, `text-violet-600`, `bg-cyan-50`, `text-teal-500`, `text-orange-500`, `text-pink-500`, etc. Full scales from 50–950.
- **Backgrounds:** `bg-white`, `bg-black`, `bg-transparent`, `bg-gradient-to-*`, `from-*`, `to-*`, `via-*`
- **Borders:** `border`, `border-*`, `border-t`, `border-b`, `border-l`, `border-r`, `rounded`, `rounded-lg`, `rounded-xl`, `rounded-2xl`, `rounded-full`, `rounded-none`, `divide-*`
- **Effects:** `shadow`, `shadow-sm`, `shadow-md`, `shadow-lg`, `shadow-xl`, `shadow-2xl`, `shadow-none`, `opacity-*`, `ring-*`, `ring-offset-*`, `blur-*`, `backdrop-blur-*`
- **Transforms & Animation:** `transform`, `scale-*`, `rotate-*`, `translate-*`, `transition`, `transition-all`, `transition-colors`, `duration-*`, `ease-*`, `animate-spin`, `animate-pulse`, `animate-bounce`, `hover:scale-105`
- **Interactivity:** `cursor-pointer`, `cursor-not-allowed`, `select-none`, `pointer-events-none`, `resize`, `appearance-none`, `outline-none`
- **Responsive prefixes:** `sm:`, `md:`, `lg:`, `xl:`, `2xl:`
- **State variants:** `hover:`, `focus:`, `active:`, `disabled:`, `group-hover:`, `peer-*`, `first:`, `last:`, `odd:`, `even:`
- **Dark mode:** `dark:` prefix (class-based). Use `dark:bg-neutral-900`, `dark:text-white`, etc.
- **Arbitrary values:** `w-[200px]`, `bg-[#ff6b6b]`, `grid-cols-[1fr_2fr]`, `text-[13px]`, etc.

Use standard Tailwind colors freely for decorative elements, status indicators, charts, and anywhere you need specific colors beyond the theme tokens. For example, `text-green-600` for success, `bg-red-50` for error backgrounds, `text-amber-500` for warnings.

### Custom Design Tokens (theme-aware)

These are custom utility classes added via the iframe's Tailwind config. They resolve to CSS custom properties that automatically adapt to light/dark mode and brand overrides. **Prefer these over standard colors for structural UI elements** (cards, buttons, text, borders, backgrounds) so the component respects the user's theme.

**Semantic text colors:** `text-default` (body text), `text-muted` (secondary), `text-dimmed` (hints/placeholders), `text-toned` (subtitles), `text-highlighted` (headings/emphasis), `text-inverted` (on dark/light bg)

**Semantic backgrounds:** `bg-default` (page), `bg-muted` (subtle sections), `bg-elevated` (cards/modals), `bg-accented` (hover states), `bg-inverted` (inverted sections)

**Semantic borders:** `border-default`, `border-muted`, `border-accented`, `border-inverted`

**Primary color scale:** `text-primary`, `bg-primary`, `border-primary`, `ring-primary` (theme primary color). Full scale: `bg-primary-50` through `bg-primary-950`, same for text/border/ring.

**Neutral color scale:** `text-neutral-500`, `bg-neutral-100`, `border-neutral-200`, etc. (theme neutral gray scale)

**Status colors (raw CSS vars):** `var(--ui-color-success)` (green), `var(--ui-color-info)` (blue), `var(--ui-color-warning)` (yellow), `var(--ui-color-error)` (red). Use inline styles or arbitrary values: `text-[var(--ui-color-success)]`.

**Border radius:** `rounded-ui` for the theme's standard radius. Or use `var(--ui-radius)` directly.

### When to use tokens vs standard Tailwind

- **Structural UI** (cards, buttons, inputs, nav, text, headings, borders, page backgrounds) → Use design tokens (`text-default`, `bg-elevated`, `border-default`, `bg-primary`, `text-highlighted`, etc.) so the component adapts to themes and brands.
- **Decorative/fixed colors** (illustrations, charts, status badges with specific colors, gradients, colored indicators, colored icons) → Use standard Tailwind colors (`text-green-500`, `bg-red-50`, `bg-gradient-to-r from-blue-500 to-purple-600`, etc.).
- **Dark mode** → Semantic tokens handle dark mode automatically. For anything using standard Tailwind colors, add `dark:` variants manually (e.g., `bg-white dark:bg-gray-900`).

### Common UI patterns

Use these Tailwind patterns to build clean, consistent interfaces:

**Card:**
```html
<div class="rounded-ui border border-default bg-default p-4 sm:p-6 space-y-3">
  <div class="border-b border-default pb-3 font-semibold text-highlighted">Header</div>
  <div class="text-default">Body content</div>
  <div class="border-t border-default pt-3 text-muted text-sm">Footer</div>
</div>
```

**Button (solid):**
```html
<button class="inline-flex items-center gap-2 px-4 py-2 rounded-ui bg-primary text-white text-sm font-medium hover:opacity-90 transition">Label</button>
```

**Button (outline):**
```html
<button class="inline-flex items-center gap-2 px-4 py-2 rounded-ui border border-default text-default text-sm font-medium hover:bg-accented transition">Label</button>
```

**Badge:**
```html
<span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-primary-100 text-primary-700">Badge</span>
```

**Input:**
```html
<input class="w-full px-3 py-2 rounded-ui border border-default bg-default text-default placeholder:text-dimmed text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 focus:border-primary transition" />
```

**Alert/Callout:**
```html
<div class="flex gap-3 p-4 rounded-ui border border-primary/20 bg-primary-50 text-sm">
  <span class="text-primary">ℹ</span>
  <div class="text-default">Alert message here</div>
</div>
```

**Separator:**
```html
<div class="border-t border-default my-4"></div>
```

**Tab bar:**
```html
<div class="flex border-b border-default">
  <button class="px-4 py-2 text-sm font-medium border-b-2 border-primary text-primary">Active</button>
  <button class="px-4 py-2 text-sm font-medium border-b-2 border-transparent text-muted hover:text-default transition">Inactive</button>
</div>
```

**Progress bar:**
```html
<div class="w-full bg-neutral-200 dark:bg-neutral-700 rounded-full h-2">
  <div class="bg-primary h-2 rounded-full transition-all duration-300" :style="{ width: progress + '%' }"></div>
</div>
```

**Tooltip (CSS-only):**
```html
<div class="relative group">
  <span>Hover me</span>
  <div class="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 text-xs bg-inverted text-inverted rounded opacity-0 group-hover:opacity-100 transition pointer-events-none whitespace-nowrap">Tooltip text</div>
</div>
```

### `get_reference` tool

You have a `get_reference` tool that fetches detailed UI component and design system documentation. **Call this before building complex interfaces** (forms, dashboards, data displays, chat UIs) to get the full API reference for relevant components and layout patterns. Topics available:
- `overview` — Full component library overview with examples
- `components` — All 125+ components organized by category with props and slots
- `theming` — Color system, CSS variables, customization patterns
- `composables` — Toast notifications, programmatic overlays, keyboard shortcuts
- `layout-dashboard` — Admin panel with sidebar, panels, navbar patterns
- `layout-page` — Landing pages, marketing pages, blog layouts
- `layout-chat` — AI chat interfaces with messages, prompt, model selector
- `layout-docs` — Documentation sites with navigation and TOC
- `layout-editor` — Rich text editor with toolbars

Note: The reference docs describe Nuxt UI components (`<UButton>`, `<UCard>`, etc.) which are NOT available in the preview iframe. Use the docs to understand the **visual patterns, prop structures, and layout compositions**, then implement them using plain HTML + Tailwind CSS with the design tokens above. Do NOT generate `<UButton>`, `<UCard>`, or any `<U*>` components — they will not render.
