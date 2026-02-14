# AGENTS.md — Playshape

> An open-source, local-first desktop and mobile application for learning experience designers to rapidly create AI-powered interactive practice activities.

## Project Overview

Playshape is a cross-platform app that empowers learning experience designers (LXDs) to go from raw content and learning objectives to fully functional, interactive practice experiences — powered by their own LLM models. The app generates "practice activities" which are essentially self-contained mini web applications (branching scenarios, AI role-plays, assessments, case studies) that can be exported as SCORM/xAPI packages, standalone HTML, or embeddable web components. The app runs on desktop via Electron and on iOS/Android via Capacitor, sharing a single Nuxt/Vue codebase.

### Core Philosophy

- **Local-first**: All data lives on the user's machine in SQLite. No account required. No cloud dependency for core functionality.
- **BYOLLM**: Users bring their own LLM — local models via Ollama/LM Studio, or API keys for OpenAI/Anthropic/Google. The app never locks users into a specific provider.
- **Open-source**: MIT licensed. The instructional design community deserves free, powerful tooling.
- **Privacy by default**: Content stays on-device. Embeddings are generated locally. The only network calls are to the user's chosen LLM provider.

### Values

- **Play is practice**: People learn by doing and failing — the best way to do that is to play.
- **Performance first**: Learning designers should focus on what people need to observably do first and all else will follow.
- **Content serves action**: Content and even the knowledge of it is only useful if it enables people to do the things we're helping them do.
- **Technology as leverage**: Learning designers can leverage technology to go far beyond what they've traditionally done.
- **Measure or it didn't happen**: Measurement should be a part of any learning design. If you can't demonstrate the impact, it didn't happen.

---

## Tech Stack

### Core

| Layer | Technology | Notes |
|-------|-----------|-------|
| Desktop shell | **Electron** | Full Node.js access for native desktop capabilities |
| Mobile shell | **Capacitor** | Wraps the Nuxt web app into native iOS/Android. Access native APIs via Capacitor plugins |
| Frontend framework | **Nuxt 4** | SSR disabled (`ssr: false`), used for file-based routing, auto-imports, composables. Shared across Electron and Capacitor |
| UI components | **Nuxt UI** | Built on Reka UI + Tailwind CSS. Use Nuxt UI components as the primary UI layer |
| Images | **Nuxt Image** | Optimized image handling, lazy loading, responsive sizing for content previews and activity assets |
| Security | **Nuxt Security** | CSP headers, rate limiting, XSS protection. Configures security defaults for the Electron renderer |
| Linting | **Nuxt ESLint** | Project-aware ESLint config with Vue/Nuxt rules. Flat config format |
| Testing | **Nuxt Test Utils** | Component and integration testing with Vitest. Use for composable and page-level tests |
| Integration | **Local Nuxt module** (`modules/electron.ts`) + **vite-plugin-electron** | Custom module bridges Nuxt and Electron. Uses `vite-plugin-electron` for building main/preload entries and managing the Electron process lifecycle |

### Data Layer

| Concern | Technology | Notes |
|---------|-----------|-------|
| Database (desktop) | **better-sqlite3** | Synchronous SQLite for Electron main process |
| Database (mobile) | **@capacitor-community/sqlite** | Native SQLite access on iOS/Android. Supports raw SQL, so Drizzle can sit on top |
| ORM | **Drizzle ORM** | Type-safe queries, schema-as-code, migration generation |
| Migrations | **Drizzle Kit** | Generates SQL migration files; Drizzle's `migrate()` runs them on app startup before the window loads |
| Vector search | **sqlite-vec** (desktop) | SQLite extension for KNN vector similarity search. Desktop only — on mobile, fall back to brute-force cosine similarity over stored vectors or call an API-based embedding/search provider |
| Validation | **Zod** | Runtime validation for all data boundaries — LLM outputs, activity definitions, user input, IPC messages |

### AI Layer

| Concern | Technology | Notes |
|---------|-----------|-------|
| LLM abstraction | **Vercel AI SDK** (`ai` package) | Unified interface for all providers. Use `@ai-sdk/openai`, `@ai-sdk/anthropic`, and community Ollama provider |
| Local embeddings | **Transformers.js** (`@xenova/transformers`) | Runs ONNX models in Node.js (desktop) or WASM (mobile). Default model: `all-MiniLM-L6-v2` (384 dimensions). On mobile, consider cloud embedding as an alternative for performance |
| Structured output | **AI SDK + Zod** | Use `generateObject()` with Zod schemas for type-safe LLM outputs |

### Distribution

| Concern | Technology | Notes |
|---------|-----------|-------|
| Desktop packaging | **electron-builder** | Builds for macOS (.dmg), Windows (NSIS), Linux (AppImage, .deb) |
| Desktop auto-updates | **electron-updater** | Checks GitHub Releases for new versions; downloads in background |
| Mobile packaging | **Capacitor CLI** | Builds native Xcode and Android Studio projects for App Store / Play Store distribution |
| CI/CD | **GitHub Actions** | Automated cross-platform builds, code signing, and release publishing for all targets |

---

## Architecture Decisions

### Platform Abstraction Layer

The app runs on three targets — desktop (Electron), mobile (Capacitor), and cloud (standard web deployment) — with a shared Nuxt/Vue codebase. The **Nitro server layer** (`server/api/`, `server/utils/`) is the canonical API for all business logic. The frontend always calls `/api/*` endpoints via `$fetch`/`useFetch`, regardless of which platform it's running on. This means the frontend never imports directly from Electron or Capacitor APIs.

On desktop, Nitro runs embedded inside the Electron process — it serves the SPA and handles API requests locally. On a cloud deployment, the same Nitro server runs on whatever host you deploy to (Node, serverless, edge). On mobile, Nitro can run as a local server within the app or API calls can route to a cloud-hosted instance.

Platform-specific capabilities that cannot be expressed as HTTP endpoints — file dialogs, OS keychain access, window management — are handled via a thin IPC layer on Electron or native plugins on Capacitor. These are the exception, not the rule. The vast majority of app logic flows through Nitro server routes.

This architecture means:
- **One API implementation** shared across all platforms — no logic duplication
- **Cloud deployment is nearly free** — deploy the same Nuxt app without the Electron shell
- New features are built once in the server layer and work everywhere
- Platform-specific adapters (database driver, secure storage) are injected in `server/utils/` or `server/plugins/`

### Database: Hybrid Relational + JSON

Activities have wildly varying structures (branching scenarios vs. drag-and-drop vs. AI role-play). Use a hybrid model:

- **Relational tables** for structured, queryable data: projects, activities (metadata), skills, content, settings
- **JSON columns** (Drizzle's text column with `mode: 'json'`) for flexible activity definitions that vary by type
- **Zod schemas** per activity type validate the JSON at the application layer
- Use a `type` column as a discriminator so each activity's JSON definition can be validated against the correct Zod schema via a discriminated union

### Server API Layer (Nitro)

All business logic — database queries, LLM calls, content processing, activity generation, export — lives in Nitro server routes (`server/api/`) and server utilities (`server/utils/`). The frontend treats this as a standard REST API via `$fetch`/`useFetch`. This is true on every platform:

- **Desktop (Electron)**: Nitro runs embedded inside the Electron process. API calls from the renderer go to `localhost` — there is no external network hop. Platform-specific adapters (e.g., `better-sqlite3` for the database, `sqlite-vec` for vector search) are configured in `server/utils/` or `server/plugins/` and resolved at startup.
- **Cloud**: The same Nuxt app deploys to any Nitro-supported host (Node, Vercel, Cloudflare, etc.) with cloud-appropriate adapters (e.g., Turso/Postgres for the database, a managed vector store for search).
- **Mobile (Capacitor)**: Nitro can run as a local server within the app, or API calls can route to a cloud-hosted instance of the same API. The frontend code is identical either way.

Server routes follow Nuxt's file-based convention:
- `server/api/health.get.ts` → `GET /api/health`
- `server/api/activities.post.ts` → `POST /api/activities`
- `server/api/activities/[id].get.ts` → `GET /api/activities/:id`

### IPC Communication (Native-Only Operations)

IPC is reserved strictly for operations that cannot be expressed as HTTP endpoints — things that require direct access to native OS APIs. On desktop, these use typed IPC channels via Electron's `ipcMain`/`ipcRenderer`. On mobile, the equivalent goes through Capacitor's native plugin bridge.

Examples of IPC-only operations:
- **File dialogs**: Opening native file pickers (`dialog.showOpenDialog`)
- **Secure storage**: Reading/writing API keys via the OS keychain (`safeStorage`)
- **Window management**: Minimize, maximize, close, fullscreen
- **System tray**: Tray icon and context menu
- **Native notifications**: OS-level notifications (beyond web Notification API)

All IPC channels are defined as typed contracts in shared types and validated with Zod. The composable layer in the frontend abstracts whether an operation goes through an API call or IPC, so components don't need to know what platform they're on.

**Rule of thumb**: If it touches data or business logic, it goes through a Nitro server route. If it touches the OS, it goes through IPC or a native plugin.

### LLM Provider Configuration

Users configure LLM providers in settings. Provider configs are stored in the database, but API keys are stored separately using platform-specific secure storage — Electron's `safeStorage` API (OS keychain) on desktop, and the iOS Keychain / Android Keystore via a Capacitor secure storage plugin on mobile. Supported providers include Ollama, LM Studio (desktop only — these require a local server), OpenAI, and Anthropic. Model names are always read from user settings, never hardcoded. On mobile, only cloud-based LLM providers are available since local model servers aren't accessible.

### Embeddings & Semantic Search

On desktop, embeddings are generated in the Electron main process using Transformers.js with the `all-MiniLM-L6-v2` model (384 dimensions, max 256 tokens). Vectors are stored in sqlite-vec virtual tables and queried for KNN similarity. On mobile, Transformers.js can run via WASM but with reduced performance — consider offering a cloud embedding provider as an option, or running embeddings only on content import rather than on-the-fly. sqlite-vec is not available on mobile, so vector search falls back to brute-force cosine similarity over stored float arrays or delegates to an API-based search provider.

Use cases:
- **Content-aware generation**: Retrieve the most relevant content chunks to include in LLM context when generating activities
- **Skill auto-mapping**: Suggest which skills an activity covers based on semantic similarity to skill descriptions
- **Related activity discovery**: Find existing activities similar to what the designer is building
- **Duplicate detection**: Flag potentially redundant content or activities

### Migrations Strategy

Migrations run on every app launch before the UI is ready. Drizzle Kit generates sequential SQL migration files that are committed to git. On desktop, these are bundled via electron-builder's `extraResources` and the migration folder path must resolve correctly in both development and packaged app contexts. On mobile, migration files are bundled as app assets via Capacitor's asset system. Users who skip versions (e.g., v1.0 → v1.5) will have all intermediate migrations applied sequentially on both platforms.

### Auto-Update Flow

**Desktop:**
1. On app launch (after migrations), electron-updater checks GitHub Releases
2. If an update is found, it downloads in the background
3. User is notified via a Nuxt UI toast/notification
4. User can defer or apply the update (restart required)
5. On restart, migrations run first to handle any schema changes between versions

For open-source distribution, GitHub Releases paired with the `update.electronjs.org` service provides free auto-updates. Cloudflare R2 is an alternative static update server with no data transfer charges.

**Mobile:**
Updates are distributed through the App Store and Play Store. Migrations run on first launch after an update, same as desktop. For web-layer-only updates (no native plugin changes), Capacitor's live update capability or a similar mechanism can push updates without a full store release.

---

## Code Conventions

### General

- **TypeScript everywhere**. Strict mode enabled. No `any` types without explicit justification.
- **Zod at every boundary**: LLM outputs, IPC messages, JSON columns, user input, imported content.
- **Composables over utilities**: Prefer Vue composables (`use*`) for any logic that touches reactive state or the database.
- **Nuxt UI components first**: Always check if Nuxt UI has a component before building custom UI. Use its built-in theming/color system.

### File Naming

- Vue components: `PascalCase.vue`
- Composables: `camelCase.ts` with `use` prefix
- Database schemas: `camelCase.ts`
- Types/Zod schemas: `camelCase.ts`

### Database

- Always use Drizzle's query builder — never raw SQL strings except for sqlite-vec KNN queries.
- JSON columns: Always validate with Zod before writing, parse with Zod after reading.
- Timestamps: Store as Unix integers (Drizzle's timestamp mode).
- IDs: Use `crypto.randomUUID()` for all primary keys.

### LLM Integration

- Always use AI SDK's `generateObject()` with a Zod schema when expecting structured output.
- Always set reasonable `maxTokens` limits.
- Stream responses for long-form content generation using `streamText()`.
- Catch and surface provider-specific errors gracefully (model not found, rate limits, connection refused for local models).
- Never hardcode model names — always read from user settings.

### Error Handling

- Main process errors: Log with `electron-log`, surface to renderer via IPC.
- LLM errors: Distinguish between connection errors (Ollama not running), auth errors (bad API key), and generation errors (model refused). Show actionable messages.
- Migration errors: Fatal — show error dialog and prevent app from loading with corrupt state.
- Validation errors: Log the Zod error details, show user-friendly message in the UI.

---

## Activity Generation Pipeline

The core workflow for generating a practice activity:

1. **Input collection**: Designer provides content (text, docs, URLs), learning objectives, target audience, and selects desired activity type.
2. **Content chunking & embedding**: Source content is chunked (paragraph-level), embedded locally via Transformers.js, and stored in sqlite-vec.
3. **Context retrieval**: Relevant content chunks are retrieved via semantic search based on the learning objectives.
4. **Prompt construction**: A system prompt specific to the activity type is composed, including the retrieved context, learning objectives, and output schema.
5. **LLM generation**: AI SDK calls the user's configured provider with `generateObject()` and the appropriate Zod schema.
6. **Validation**: The LLM output is validated against the activity type's Zod schema. If validation fails, retry with error feedback.
7. **Review & edit**: The validated activity is presented in an interactive editor. The designer can manually edit any part.
8. **Preview**: The activity is rendered in a sandboxed preview (iframe or separate Electron webview).
9. **Export**: Final activity is packaged as SCORM 1.2/2004, xAPI, standalone HTML, or embeddable web component.

---

## Export Formats

### SCORM 1.2 / SCORM 2004

- Package activities as SCORM-compliant ZIP files with `imsmanifest.xml`
- Handle `suspend_data` for saving learner progress within branching scenarios
- Report completion status and score via SCORM API

### xAPI (Tin Can)

- Generate xAPI statements for granular tracking (each choice, each role-play turn, each question attempt)
- Activities self-configure their LRS endpoint at runtime (provided by the hosting LMS or configured by the designer)

### Standalone HTML

- Single-file HTML export with all JS/CSS inlined
- Works offline — no external dependencies
- Optionally includes the AI role-play capability (requires the end-learner to provide an API key or connect to a configured endpoint)

### Embeddable Web Component

- Custom element (`<playshape-activity>`) that can be dropped into any web page
- Shadow DOM for style isolation
- Attribute-based configuration

---

## Development Workflow

### Adding a New Activity Type

1. Define the Zod schema for the activity type
2. Add it to the discriminated union of all activity definitions
3. Register the type in the activity type constants
4. Create the editor component for the new type
5. Create the preview renderer (the HTML that the activity compiles to)
6. Add generation prompts specific to the new type
7. Add export adapters (SCORM, xAPI, standalone)

---

## Security Considerations

- **API keys**: Stored using platform-specific secure storage — Electron's `safeStorage` (OS keychain) on desktop, iOS Keychain / Android Keystore via Capacitor plugin on mobile. Never persisted in SQLite or config files.
- **LLM outputs**: Always validated with Zod before use. Never `eval()` or `innerHTML` raw LLM output.
- **Activity previews**: Rendered in sandboxed iframes/webviews with restricted permissions.
- **Content Security Policy**: Configured in Electron's main process on desktop. Nuxt Security module handles renderer-side CSP defaults. On mobile, Capacitor's webview security settings apply.
- **Auto-update integrity**: electron-updater validates code signatures on macOS and Windows. Mobile updates go through App Store / Play Store review.
- **No telemetry**: The app makes zero network requests except to the user's chosen LLM provider and the update server (GitHub Releases on desktop).
