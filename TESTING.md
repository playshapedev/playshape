# Testing Strategy

Playshape uses a 4-tier approach that balances coverage with maintenance burden. Everything below Tier 4 runs in CI on every push to `master` and every pull request.

## Quick start

```bash
pnpm test               # unit + integration (~3s)
pnpm test:unit          # Tier 2 only
pnpm test:integration   # Tier 3 only
pnpm test:watch         # watch mode
pnpm test:coverage      # with a coverage report in coverage/
pnpm lint               # Tier 1
pnpm typecheck          # Tier 1: app, server and test code
```

CI (`.github/workflows/ci.yml`) runs `lint`, `typecheck` and `test:coverage`, and posts a coverage summary on the run.

## The four tiers

### Tier 1: Static analysis

TypeScript strict mode and ESLint. Catches type mismatches, unused code and structural bugs before anything runs. `pnpm typecheck` checks three projects: the Vue app, the Nitro server (`.nuxt/tsconfig.server.json`), and test code plus `lib/` (`tests/tsconfig.json`).

### Tier 2: Logic tests

Fast, isolated tests for pure functions: branching logic, calculations, data transformations, validation rules.

- **Where:** `*.test.ts` next to the source, in `lib/`, `server/**` or `app/utils/`
- **Config:** `vitest.unit.config.ts` (plain Node, no Nuxt runtime, no database)
- **Rule:** import the function under test explicitly; if it needs the database or an HTTP request, it belongs in Tier 3

```ts
// server/utils/scorm/buildManifest.test.ts
import { describe, it, expect } from 'vitest'
import { buildManifest } from './buildManifest'

it('escapes XML special characters in the course name', () => {
  const xml = buildManifest({ courseId: 'c1', courseName: 'Q&A <Basics>', scormVersion: 'scorm-2004', files: ['index.html'] })
  expect(xml).toContain('Q&amp;A &lt;Basics&gt;')
})
```

Current coverage: SCORM manifest and package building, template validation, schema-change detection, activity data validation, color scales, navigation and chat mode.

### Tier 3: Integration tests

API route handlers tested end to end against a real SQLite database: request parsing, validation, queries and responses.

- **Where:** `tests/integration/api/*.test.ts`
- **Config:** `vitest.integration.config.ts`
- **How it works:**
  - `tests/integration/setup.ts` creates a temp database for each test file and applies every migration. Tests never touch `data/playshape.db`.
  - `tests/integration/utils/api.ts` mounts every file in `server/api/` on an in-process h3 app using Nitro's routing rules, so there's no Nuxt build or HTTP server. Handlers load lazily, so a test only pays for the routes it calls.
  - Nitro's auto-imports (`defineEventHandler`, `useDb`, …) are recreated with `unimport`.

```ts
// tests/integration/api/projects.test.ts
import { api } from '../utils/api'

it('rejects an empty name with 400', async () => {
  const res = await api('/api/projects', { method: 'POST', body: { name: '' } })
  expect(res.status).toBe(400)
})
```

`api()` never throws on HTTP errors. Assert on `res.status` and `res.data` directly, and never wrap assertions in `if (res.ok)`: a test that can't fail isn't a test.

For data the API can't create (such as templates, which come from the AI chat), insert fixtures from `tests/fixtures/` with `useDb()`. See `tests/integration/api/courseExport.test.ts`.

Current coverage: health check, project CRUD, course/section/activity creation, and SCORM 1.2 and 2004 export (the ZIP is unpacked and its manifest and launch page checked).

### Tier 4: End-to-end tests

Full browser tests for critical user journeys (create project → build activity → export). Not implemented yet; when flows stabilize, add Playwright tests in `tests/e2e/`.

## What to test

1. **Does TypeScript already catch this?** Skip the test.
2. **Is this pure logic with branching?** Tier 2, next to the source.
3. **Does it cross the database or an API route?** Tier 3, in `tests/integration/api/`.
4. **Is it a critical user workflow?** Tier 4 (future).
5. **None of the above?** Don't test it.

Don't test components that only render props, thin `useFetch` wrappers, or framework behavior. Never call real LLM providers from tests.

## Conventions

- **Validate request bodies with `readValidatedBody(event, schema.parse)`.** It turns a Zod failure into a 400; calling `schema.parse(await readBody(event))` turns bad input into a 500.
- **Test behavior, not implementation.** Assert on outputs and responses, not internal state or call counts.
- **Keep tests independent.** Each test creates the records it needs; don't rely on order or on another test's data.
- **Descriptive names.** The test name should state the behavior: `rejects an empty name with 400`.

## File layout

```
lib/**/*.test.ts                 Tier 2
server/**/*.test.ts              Tier 2 (server logic: SCORM, validation, …)
tests/
  fixtures/                      Shared sample data
  integration/
    setup.ts                     Temp database + migrations per test file
    utils/api.ts                 In-process API client
    api/*.test.ts                Tier 3
  tsconfig.json                  Typecheck config for test code
vitest.config.ts                 Runs both tiers as projects; coverage settings
vitest.unit.config.ts
vitest.integration.config.ts
```
