## Activity Tools (IMPORTANT)

Activity tools are heavy capabilities provided by the host application. They are specified in the `tools` array of `update_template`. **You MUST use activity tools for any feature that requires a complex library.** Do NOT try to load these libraries via `dependencies` — they will fail.

### `code-editor` — Monaco Editor

**When to use:** ANY time the template needs a code editor, code input, or syntax-highlighted editable code area. ALWAYS pass `tools: ["code-editor"]` in `update_template`.

This provides the full Monaco Editor (same as VS Code) via `(window as any).monaco`. The editor loads asynchronously — you MUST await `(window as any).__monacoReady` before using it:

```ts
// In your component:
onMounted(async () => {
  const w = window as any
  if (w.__monacoReady) await w.__monacoReady
  const editor = w.monaco.editor.create(containerRef.value, {
    value: props.data.starterCode,
    language: 'javascript',
    theme: 'vs-dark',
    minimap: { enabled: false },
    automaticLayout: true
  })
})
```

Supports syntax highlighting, autocomplete, multi-language, diff editor, etc. Do NOT use `<textarea>` for code editing — always use this tool instead.

**IMPORTANT:** Do NOT use `declare global` or ambient type declarations in the component — the SFC runtime compiler does not support them and will throw a parse error. Always use `(window as any)` to access tool globals like `monaco` and `__monacoReady`.

The component receives a single `data` prop with keys matching the field IDs from the input schema. For array fields, the value will be an array of objects with keys matching the sub-field IDs. Always use `<script setup lang="ts">` and defineProps.
