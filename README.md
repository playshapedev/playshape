# Playshape

An open-source, local-first desktop and mobile application for learning experience designers to rapidly create AI-powered interactive practice activities.

> **This project is in active, heavy development and is alpha-quality at best. It is not ready for use on any real project. APIs, data schemas, and features will change without warning. If you're interested in the vision, we'd love to hear from you — but please don't rely on this for production work yet.**

## What is Playshape?

Playshape helps learning experience designers (LXDs) go from raw content and learning objectives to fully functional, interactive practice experiences — powered by their own LLM models. Think branching scenarios, AI role-plays, assessments, and case studies — generated through conversation, exported as SCORM, xAPI, standalone HTML, or embeddable web components.

## Philosophy

These beliefs shape every decision we make in this project:

- **Play is practice** — People learn by doing and failing. The best way to do that is to play.
- **Performance first** — Learning designers should focus on what people need to observably *do* first, and all else will follow.
- **Content serves action** — Content and even the knowledge of it is only useful if it enables people to do the things we're helping them do.
- **Technology as leverage** — Learning designers can leverage technology to go far beyond what they've traditionally done.
- **Measure or it didn't happen** — Measurement should be a part of any learning design. If you can't demonstrate the impact, it didn't happen.

## Design Principles

- **Local-first** — All data lives on your machine in SQLite. No account required. No cloud dependency for core functionality.
- **BYOLLM** — Bring your own LLM. Local models via Ollama or LM Studio, or API keys for OpenAI, Anthropic, and Google. No vendor lock-in.
- **Privacy by default** — Content stays on-device. Embeddings are generated locally. The only network calls are to your chosen LLM provider.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Desktop | Electron |
| Mobile | Capacitor |
| Frontend | Nuxt 4 (Vue 3) + Nuxt UI + Tailwind CSS |
| Database | SQLite (better-sqlite3 / @capacitor-community/sqlite) + Drizzle ORM |
| AI | Vercel AI SDK v6 + Transformers.js for local embeddings |
| Vector search | sqlite-vec |
| Export | SCORM 1.2/2004, xAPI, standalone HTML, web components |

## Status

**Alpha** — Under heavy development. Here's what exists today:

- [x] Project and template management
- [x] AI-powered template generation via chat
- [x] Live preview with sandboxed iframe rendering
- [x] Multi-provider LLM support (Ollama, LM Studio, OpenAI, Anthropic)
- [x] Branding system (custom colors, fonts, typography)
- [x] Content libraries with semantic search
- [x] Interface + activity template types
- [ ] SCORM/xAPI export
- [ ] Standalone HTML export
- [ ] Web component export
- [ ] Mobile (Capacitor) build
- [ ] Auto-updates
- [ ] Activity type system (branching scenarios, role-plays, assessments, etc.)

## Contributing

We welcome contributors who share our philosophy about learning design. Please read our [Contributing Guide](CONTRIBUTING.md) before getting started. This is an opinionated project — we ask that you open a discussion or issue before investing significant time on a contribution.

## Community

- [Code of Conduct](CODE_OF_CONDUCT.md)
- [Security Policy](SECURITY.md)

## License

[MIT](LICENSE)
