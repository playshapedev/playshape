# Testing Strategy

This document outlines the testing strategy for Playshape, following a 4-tier approach that balances coverage with maintenance burden.

## The Four Tiers

### Tier 1: Static Analysis

TypeScript strict mode + ESLint (already configured). This catches type mismatches, unused variables, and basic structural bugs at development time.

**Already configured:** No additional work needed. Runs on every save.

---

### Tier 2: Logic Tests

Fast, isolated unit tests for pure functions. These test business logic that TypeScript can't verify — conditionals, calculations, transformations.

**When to write Tier 2 tests:**
- Functions with branching logic or calculations
- Data transformations (parsing, formatting, normalization)
- Business rule validation
- Utility functions with non-trivial logic

**When NOT to write Tier 2 tests:**
- Simple pass-through functions (thin wrappers)
- Type-only code (type guards, interfaces)
- Functions covered by framework internals

**Example from our codebase:**

```typescript
// lib/navigation/resolver.ts
export function resolveNavItem(
  item: NavItem,
  currentPath: string,
  parentPath: string = ''
): ResolvedNavItem {
  const fullPath = parentPath + item.path
  const isActive = currentPath === fullPath || currentPath.startsWith(fullPath + '/')
  
  return {
    ...item,
    path: fullPath,
    isActive,
    children: item.children?.map(child => 
      resolveNavItem(child, currentPath, fullPath)
    )
  }
}
```

```typescript
// lib/navigation/resolver.test.ts
import { describe, it, expect } from 'vitest'
import { resolveNavItem } from './resolver'

describe('resolveNavItem', () => {
  it('marks exact path match as active', () => {
    const item = { path: '/projects', label: 'Projects', icon: 'folder' }
    const result = resolveNavItem(item, '/projects')
    expect(result.isActive).toBe(true)
  })

  it('marks child path as active when parent matches', () => {
    const item = { 
      path: '/projects', 
      label: 'Projects', 
      icon: 'folder',
      children: [{ path: '/:id', label: 'Detail', icon: 'file' }]
    }
    const result = resolveNavItem(item, '/projects/123')
    expect(result.isActive).toBe(true)
  })

  it('resolves nested children paths correctly', () => {
    const item = { 
      path: '/projects', 
      label: 'Projects', 
      icon: 'folder',
      children: [{ path: '/:id', label: 'Detail', icon: 'file' }]
    }
    const result = resolveNavItem(item, '/projects/123')
    expect(result.children?.[0].path).toBe('/projects/123')
  })
})
```

**Key characteristics:**
- No Nuxt/Vue imports
- No DOM dependencies
- No mocking required
- Fast execution (< 100ms per test file)

---

### Tier 3: Integration Tests

Tests for API routes and server-side code that cross system boundaries — database queries, HTTP responses, auth middleware.

**When to write Tier 3 tests:**
- API route handlers (server/api/*.ts)
- Database operations through the API
- Server-side validation
- Composables that call APIs

**When NOT to write Tier 3 tests:**
- Components that just render props
- Simple fetch wrappers (TypeScript covers this)
- Framework internals

**Example: API Route Test**

```typescript
// tests/api/projects.test.ts
import { describe, it, expect, beforeAll, afterAll } from 'vitest'
import { setup, $fetch } from '@nuxt/test-utils'

describe('Project API', () => {
  beforeAll(async () => {
    await setup({ server: true })
  })

  it('GET /api/projects returns array of projects', async () => {
    const projects = await $fetch('/api/projects')
    expect(Array.isArray(projects)).toBe(true)
    expect(projects[0]).toMatchObject({
      id: expect.any(String),
      name: expect.any(String),
    })
  })

  it('POST /api/projects creates project with valid data', async () => {
    const project = await $fetch('/api/projects', {
      method: 'POST',
      body: { name: 'Test Project', description: 'A test' }
    })
    expect(project).toMatchObject({
      id: expect.any(String),
      name: 'Test Project',
    })
  })

  it('POST /api/projects returns 400 for invalid data', async () => {
    const res = await $fetch('/api/projects', {
      method: 'POST',
      body: { name: '' }, // Invalid: empty name
      ignoreResponseError: true,
    })
    expect(res.statusCode).toBe(400)
  })
})
```

**Example: Composable Test**

```typescript
// app/composables/useProjects.spec.ts
import { describe, it, expect, beforeAll } from 'vitest'
import { setup, registerEndpoint } from '@nuxt/test-utils'

describe('useProjects composable', () => {
  beforeAll(async () => {
    await setup({ server: true })
  })

  it('fetches projects list on initialization', async () => {
    registerEndpoint('/api/projects', {
      method: 'GET',
      handler: () => [{ id: '1', name: 'Test Project' }]
    })

    const { projects, refresh } = useProjects()
    await refresh()
    
    expect(projects.value).toHaveLength(1)
    expect(projects.value[0].name).toBe('Test Project')
  })
})
```

**Key characteristics:**
- Uses `@nuxt/test-utils` with Nuxt environment
- Can mock API endpoints with `registerEndpoint()`
- Tests run against a real (test) database
- Slower than Tier 2 but still fast enough for development

---

### Tier 4: E2E Tests

Full browser tests for critical user paths. Reserved for workflows where failure means the app is fundamentally broken.

**When to write Tier 4 tests:**
- Authentication flows
- Primary user workflows (e.g., create project → add content → generate activity)
- Export/publishing flows
- Critical business processes

**When NOT to write Tier 4 tests:**
- Component rendering (TypeScript + Tier 3 cover this)
- Edge cases (use Tier 2 and 3 instead)
- Visual appearance (use visual regression tools)

**Status:** Tier 4 tests are not yet implemented. When critical paths stabilize, we'll add Playwright tests in `tests/e2e/`.

---

## Test Organization

### File Structure

```
project-root/
├── lib/                              # Tier 2: Logic tests co-located
│   ├── navigation/
│   │   ├── resolver.ts
│   │   └── resolver.test.ts          # Co-located test
│   └── colorScale/
│       ├── colorScale.ts
│       └── colorScale.test.ts        # Co-located test
│
├── app/
│   ├── composables/
│   │   ├── useProjects.ts
│   │   └── useProjects.spec.ts       # Composable tests (Tier 3)
│   └── utils/
│       └── navigation.ts             # Re-exports from lib/
│
├── server/
│   └── api/                          # No test files here
│       ├── projects.get.ts
│       └── projects.post.ts
│
├── tests/
│   ├── api/                          # Tier 3: Integration tests
│   │   ├── projects.test.ts
│   │   ├── health.test.ts
│   │   └── database.test.ts
│   ├── fixtures/                     # Shared test data
│   │   └── projects.ts
│   └── setup.ts                      # Test environment configuration
│
└── tests/e2e/                        # Tier 4: E2E tests (future)
    └── workflows/
        └── create-project.spec.ts
```

### Configuration

We use separate Vitest configurations for each tier:

```typescript
// vitest.unit.config.ts
export default defineConfig({
  test: {
    name: 'unit',
    environment: 'node',  // No Nuxt, no DOM
    include: ['lib/**/*.test.ts'],
  },
})

// vitest.integration.config.ts
export default defineConfig({
  test: {
    name: 'integration',
    environment: 'nuxt',  // Full Nuxt environment
    include: [
      'tests/api/**/*.test.ts',
      'app/composables/**/*.spec.ts',
    ],
  },
})
```

---

## Running Tests

### Commands

```bash
# Run all tests
npm run test

# Run only Tier 2 (logic) tests
npm run test:unit

# Run only Tier 3 (integration) tests
npm run test:integration

# Run tests in watch mode
npm run test:watch

# Run tests with coverage report
npm run test:coverage
```

### Current Test Coverage

- **Tier 2 (Logic):** 38 tests across navigation, color scale, and chat mode utilities
- **Tier 3 (Integration):** 29 tests across projects API, health endpoint, database connectivity, and composables
- **Tier 4 (E2E):** Not yet implemented

---

## Best Practices

### Do:

1. **Extract pure logic to `lib/`** — Makes it easy to test without framework dependencies
2. **Test at boundaries** — Where your code meets databases, APIs, or complex logic
3. **Use descriptive test names** — The test name should explain the behavior being tested
4. **Test behavior, not implementation** — Assert on outputs, not internal state
5. **Keep tests fast** — Tier 2 tests should run in milliseconds

### Don't:

1. **Test the framework** — Don't test that Vue's `ref()` works or that `useFetch` makes HTTP calls
2. **Mock everything** — If you need 5 mocks, you may be testing the wrong thing
3. **Test implementation details** — Don't assert on internal state or function call counts
4. **Aim for 100% coverage** — Focus on testing the right things, not every line
5. **Test trivial code** — One-liner utility functions often don't need tests

---

## Decision Guide

When deciding whether to write a test, ask:

1. **Does TypeScript already catch this?** → Skip the test
2. **Is this pure logic with branching?** → Tier 2 test in `lib/`
3. **Does this cross a system boundary?** → Tier 3 test in `tests/api/`
4. **Is this a critical user workflow?** → Tier 4 test in `tests/e2e/`
5. **Is this none of the above?** → Don't test it

---

## Further Reading

For detailed guidance on testing with Nuxt and Vitest, refer to the **nuxt-testing skill** in `.agents/skills/nuxt-testing/SKILL.md`.

The skill provides:
- Detailed test configuration examples
- Advanced mocking patterns with `@nuxt/test-utils`
- Database testing strategies
- Troubleshooting common issues
