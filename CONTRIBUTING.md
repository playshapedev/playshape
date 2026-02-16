# Contributing to Playshape

Thank you for your interest in contributing to Playshape. This project exists because we believe learning experience designers deserve free, powerful, open-source tooling — and we're glad you're here.

## Before You Start

**Playshape is an opinionated project.** The philosophy behind how we think about learning design — performance-first, content-serves-action, measurement-driven — directly shapes the software we build. Not every feature idea or implementation approach will align with the project's direction, and that's okay.

**Please communicate before investing significant time.** Open an issue or start a discussion before writing a large PR. This helps us:

- Confirm the feature or change fits the project's vision
- Avoid duplicate work
- Suggest the best approach given the existing architecture
- Save you time if something isn't going to be merged

Small fixes (typos, obvious bugs, documentation improvements) don't need prior discussion — just open a PR.

## Who We're Looking For

If you share our beliefs about learning design, you're welcome here:

- **People learn by doing and failing.** Practice activities should be interactive and let learners make mistakes safely.
- **Focus on performance first.** What do learners need to *do*? Everything else follows from that.
- **Content serves action.** We don't build content delivery tools. We build practice tools.
- **Technology is leverage.** AI and modern tooling should empower designers to do things that weren't possible before.
- **Measure or it didn't happen.** If we can't track and demonstrate learning impact, we haven't done our job.

You don't need to be a learning designer to contribute — developers, designers, and documentation writers are all valuable. But understanding *why* this project exists will help your contributions land well.

## What Might Not Get Merged

To set expectations honestly:

- Features that treat Playshape as a general-purpose content authoring tool rather than a practice/activity tool
- Approaches that add cloud dependencies for core functionality (local-first is non-negotiable)
- Changes that lock users into a specific LLM provider
- Large refactors without prior discussion
- PRs that don't follow the project's code conventions (see below)

This isn't meant to discourage you — it's meant to respect your time by being upfront about the project's boundaries.

## Code Conventions

The [AGENTS.md](AGENTS.md) file is the single source of truth for how the project should be built. It covers:

- Architecture decisions and the platform abstraction layer
- TypeScript conventions (strict mode, no `any` without justification)
- Database patterns (Drizzle ORM, never raw SQL, Zod validation at every boundary)
- LLM integration patterns (AI SDK, structured output, provider configuration)
- Component and file naming conventions
- Error handling expectations

Please read it before submitting code changes.

## Pull Request Expectations

- **Keep PRs focused.** One logical change per PR. If you find yourself fixing unrelated things along the way, split them into separate PRs.
- **Describe the "why."** Your PR description should explain why the change is needed, not just what it does.
- **Reference related issues.** Link to the issue or discussion that prompted the change.
- **Test your changes.** At minimum, verify the app builds (`pnpm build`) and your change works as expected.
- **Follow existing patterns.** When in doubt, look at how similar things are done elsewhere in the codebase.

## Reporting Bugs

Use the [bug report template](.github/ISSUE_TEMPLATE/bug_report.md) and include:

- Steps to reproduce
- Expected vs. actual behavior
- Your environment (OS, Node version, Electron version if applicable)
- Screenshots or error logs if relevant

## Suggesting Features

Use the [feature request template](.github/ISSUE_TEMPLATE/feature_request.md). The most helpful feature requests include:

- The problem or use case you're trying to solve
- How it connects to the project's philosophy (performance-first learning, practice over content delivery, etc.)
- Your proposed approach (if you have one)
- Alternatives you've considered

## Security Vulnerabilities

**Do not open a public issue for security vulnerabilities.** See our [Security Policy](SECURITY.md) for responsible disclosure instructions.

## License

By contributing to Playshape, you agree that your contributions will be licensed under the [MIT License](LICENSE).
