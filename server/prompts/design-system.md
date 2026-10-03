## Design System

**IMPORTANT: Always use Nuxt UI components as your first choice.** The preview iframe has 100+ pre-built Nuxt UI components (`<UButton>`, `<UCard>`, `<UInput>`, `<UAlert>`, etc.) that are accessible, theme-aware, and require far less code than raw HTML. Only fall back to raw HTML + Tailwind when Nuxt UI doesn't have a component for your specific need.

The preview iframe also loads **Tailwind CSS v3 via CDN** for custom styling. The iframe's Tailwind config extends with custom design tokens (CSS custom properties) that map to semantic utilities for colors, backgrounds, borders, and border radius.

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

### Dark Mode (CRITICAL)

**Every template MUST work in both light and dark mode.** Users can toggle between modes, and exported activities may be viewed in either.

**DO NOT USE these — they break in dark mode:**
- `text-black`, `text-white`, `text-gray-900`, `text-gray-100` for body text
- `bg-white`, `bg-gray-50`, `bg-gray-900` for backgrounds
- `border-gray-200`, `border-gray-700` for borders

**USE these instead — they adapt automatically:**
- Text: `text-default`, `text-muted`, `text-dimmed`, `text-highlighted`
- Backgrounds: `bg-default`, `bg-muted`, `bg-elevated`, `bg-accented`
- Borders: `border-default`, `border-muted`, `border-accented`

Nuxt UI components handle dark mode automatically — this is another reason to always use them.

### When to use tokens vs standard Tailwind

- **Structural UI** (cards, buttons, inputs, nav, text, headings, borders, page backgrounds) → Use design tokens (`text-default`, `bg-elevated`, `border-default`, `bg-primary`, `text-highlighted`, etc.) so the component adapts to themes and dark mode.
- **Decorative/fixed colors** (illustrations, charts, status badges with specific colors, gradients, colored indicators, colored icons) → Use standard Tailwind colors (`text-green-500`, `bg-red-50`, `bg-gradient-to-r from-blue-500 to-purple-600`, etc.). These are fine because they're meant to be a specific color regardless of mode.
- **If you must use hardcoded colors for structural elements** → Add `dark:` variants manually (e.g., `bg-white dark:bg-neutral-900`), but prefer semantic tokens instead.

### Nuxt UI vs Raw HTML comparison

**Always prefer the Nuxt UI version:**

| Need | Use Nuxt UI | NOT raw HTML |
|------|-------------|--------------|
| Button | `<UButton>Next</UButton>` | `<button class="inline-flex items-center...">` |
| Card | `<UCard><template #header>...</UCard>` | `<div class="rounded-ui border...">` |
| Input | `<UInput v-model="answer" />` | `<input class="w-full px-3 py-2...">` |
| Alert | `<UAlert title="Correct!" color="success" />` | `<div class="flex gap-3 p-4 rounded-ui...">` |
| Badge | `<UBadge>Score: 5</UBadge>` | `<span class="inline-flex px-2 py-0.5...">` |
| Progress | `<UProgress :value="75" />` | `<div class="w-full bg-neutral-200...">` |
| Tabs | `<UTabs :items="tabs" />` | `<div class="flex border-b...">` |
| Checkbox | `<UCheckbox v-model="selected" />` | `<input type="checkbox" class="...">` |

### Fallback patterns (only when Nuxt UI can't do it)

These raw HTML patterns are for **custom visualizations and game mechanics only** — never for standard UI:

**Custom container (when UCard doesn't fit):**
```html
<div class="rounded-ui border border-default bg-default p-4 space-y-3">...</div>
```

**Separator (between custom elements):**
```html
<div class="border-t border-default my-4"></div>
```

**CSS-only tooltip (for lightweight hover hints):**
```html
<div class="relative group">
  <span>Hover me</span>
  <div class="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 text-xs bg-inverted text-inverted rounded opacity-0 group-hover:opacity-100 transition pointer-events-none whitespace-nowrap">Tooltip</div>
</div>
```

## Nuxt UI Components (USE THESE FIRST)

**You MUST use Nuxt UI components whenever possible.** They are pre-built, accessible, theme-aware, and require far less code. Components are dynamically loaded based on what you use — no imports needed.

### Why Nuxt UI is required

1. **Accessibility** — Built-in ARIA attributes, keyboard navigation, focus management
2. **Consistency** — Matches the app's design language automatically
3. **Less code** — A `<UButton>` replaces 10+ Tailwind classes
4. **Theme-aware** — Responds to light/dark mode and brand colors
5. **Tested** — Production-ready components vs. hand-rolled HTML

### Using Nuxt UI

Simply use the components in your template:

```vue
<template>
  <div class="space-y-4">
    <UCard>
      <template #header>
        <h3 class="font-semibold">Question</h3>
      </template>
      <p>What is the capital of France?</p>
      <template #footer>
        <div class="flex gap-2">
          <UButton @click="checkAnswer('Paris')">Paris</UButton>
          <UButton variant="outline" @click="checkAnswer('London')">London</UButton>
        </div>
      </template>
    </UCard>
    
    <UAlert v-if="feedback" :color="isCorrect ? 'success' : 'error'" :title="feedback" />
  </div>
</template>
```

### Common components for learning activities

| Component | Use case |
|-----------|----------|
| `<UButton>` | Actions, choices, navigation |
| `<UCard>` | Content containers, question cards |
| `<UAlert>` | Feedback messages, hints, warnings |
| `<UBadge>` | Status indicators, scores, labels |
| `<UTabs>` | Multi-step activities, content sections |
| `<UAccordion>` | Expandable content, FAQs |
| `<UProgress>` | Progress tracking, scores |
| `<UInput>` | Text input, fill-in-the-blank |
| `<UTextarea>` | Long-form responses |
| `<UCheckbox>` | Multiple choice (multiple select) |
| `<URadioGroup>` | Multiple choice (single select) |
| `<UIcon>` | Icons via `name="i-lucide-check"` |

### Icons

Use Iconify icons with the `i-{collection}-{name}` format:

```vue
<UIcon name="i-lucide-check" class="size-5 text-green-500" />
<UButton icon="i-lucide-arrow-right">Next</UButton>
<UAlert icon="i-lucide-info" title="Hint">Think about geography.</UAlert>
```

Browse icons at [icones.js.org](https://icones.js.org). The `lucide` collection is recommended.

### Learning more

Load the `nuxt-ui` skill for comprehensive documentation:
- Component props, slots, and variants
- Form validation with Zod
- Theming and customization
- Layout patterns (dashboard, chat, etc.)

### When raw HTML + Tailwind is acceptable

Only use raw HTML + Tailwind in these specific cases:
- **Custom visualizations** — Canvas, SVG charts, complex animations that Nuxt UI can't do
- **Game mechanics** — Drag-and-drop zones, spatial interactions, custom hit detection
- **Unique layouts** — When no Nuxt UI layout component fits and you need a one-off structure

**Never use raw HTML for:** buttons, cards, inputs, alerts, badges, tabs, accordions, modals, forms, progress bars, or any standard UI element. Nuxt UI has components for all of these.
