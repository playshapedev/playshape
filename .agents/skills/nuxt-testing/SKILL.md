# Skill: nuxt-testing

Testing strategy for Nuxt applications using the 4-tier approach with `@nuxt/test-utils`.

## Philosophy

Test at boundaries where TypeScript can't help: logic with branching, system integrations (DB, HTTP), and critical user workflows. Don't test what `tsc` already guarantees.

## The 4 Tiers (Nuxt Edition)

### Tier 1: Static Analysis
Already running via `nuxt typecheck` and ESLint. Catches type mismatches, unused imports, structural issues.

### Tier 2: Logic Tests
Pure functions, data transformations, business rules. **Co-locate** with source files.

```typescript
// lib/scoring/calculate.ts
export function calculateScore(items: Item[]): number { ... }

// lib/scoring/calculate.test.ts
import { describe, it, expect } from 'vitest'
import { calculateScore } from './calculate'

describe('calculateScore', () => {
  it('returns 0 for empty array', () => {
    expect(calculateScore([])).toBe(0)
  })
})
```

**Skip:** Type guards, thin wrappers, simple mappings (types cover these).

### Tier 3: Integration Tests
API routes, DB queries, server middleware. Use `@nuxt/test-utils` with the Nuxt environment.

**Setup:**
```typescript
// vitest.config.ts
import { defineVitestConfig } from '@nuxt/test-utils/config'

export default defineVitestConfig({
  test: {
    environment: 'nuxt', // or 'node' for pure logic tests
  },
})
```

**Test server routes directly:**
```typescript
// tests/api/projects.test.ts
import { describe, it, expect } from 'vitest'
import { $fetch, setup } from '@nuxt/test-utils/e2e'

describe('/api/projects', async () => {
  await setup({ server: true })

  it('creates a project', async () => {
    const res = await $fetch('/api/projects', {
      method: 'POST',
      body: { name: 'Test Project' },
    })
    expect(res).toHaveProperty('id')
  })
})
```

**Key helpers:**
- `registerEndpoint(path, handler)` — Mock Nitro endpoints for component tests
- `mockNuxtImport(name, factory)` — Mock auto-imports (use sparingly)
- `mountSuspended(component)` — Mount components with Nuxt context

### Tier 4: E2E Tests
Critical user workflows only (5-15 tests max). Use Playwright.

```typescript
// tests/e2e/create-project.spec.ts
import { test, expect } from '@playwright/test'

test('user can create a project', async ({ page }) => {
  await page.goto('/projects/new')
  await page.fill('[name="name"]', 'My Project')
  await page.click('button[type="submit"]')
  await expect(page).toHaveURL('/projects/my-project')
})
```

## File Organization

```
lib/
  utils/
    format.ts
    format.test.ts          ← Tier 2 (co-located)

server/
  api/
    projects.post.ts      ← No test file here

tests/
  api/                    ← Tier 3
    projects.test.ts
  e2e/                    ← Tier 4
    create-project.spec.ts
  fixtures/               ← Shared test data
    sample-project.json
```

## Vitest Configuration (Projects)

For mixed environments (recommended):

```typescript
// vitest.config.ts
import { defineConfig } from 'vitest/config'
import { defineVitestProject } from '@nuxt/test-utils/config'

export default defineConfig({
  test: {
    projects: [
      {
        test: {
          name: 'unit',
          include: ['lib/**/*.test.ts'],
          environment: 'node',
        },
      },
      await defineVitestProject({
        test: {
          name: 'nuxt',
          include: ['tests/**/*.test.ts'],
          environment: 'nuxt',
        },
      }),
    ],
  },
})
```

Run specific projects:
```bash
npx vitest --project unit     # Logic tests only
npx vitest --project nuxt     # Nuxt environment tests
```

## Decision Checklist

Before writing a test, ask:

1. **Does TypeScript catch this?** → Skip
2. **Pure logic with branching?** → Tier 2, co-located
3. **Crosses system boundary (DB, HTTP)?** → Tier 3, `tests/api/`
4. **Critical multi-step workflow?** → Tier 4, `tests/e2e/`
5. **None of the above?** → Don't test

## What to Test in Nuxt

**Test:**
- Server route handlers (response shape, status codes, auth)
- Database queries and transactions
- Business logic with conditional paths
- Composables with side effects (useFetch wrappers, localStorage)
- Critical user workflows spanning multiple pages

**Skip:**
- Components that just render props (TypeScript covers this)
- Simple `useFetch` calls (test the server route instead)
- Layouts, pages without logic
- `defineEventHandler` boilerplate

## Installation

```bash
pnpm add -D @nuxt/test-utils vitest @vue/test-utils happy-dom playwright-core @playwright/test
```

Add to `nuxt.config.ts`:
```typescript
export default defineNuxtConfig({
  modules: ['@nuxt/test-utils/module'], // Optional, adds DevTools integration
})
```

## Anti-Patterns

- **Testing `useState` behavior** — Framework authors already did this
- **Mock-heavy unit tests** — If you need 5 mocks, it's an integration test
- **Component snapshots** — Break constantly, teach nothing
- **100% coverage targets** — Measure bugs caught, not lines executed
- **Testing implementation details** — Test observable output, not internal state
