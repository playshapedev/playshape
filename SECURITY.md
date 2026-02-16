# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability in Playshape, **please do not open a public GitHub issue.** Security vulnerabilities disclosed publicly before a fix is available put all users at risk.

Instead, please report vulnerabilities by emailing **security@playshape.io**. Include:

- A description of the vulnerability
- Steps to reproduce or a proof of concept
- The potential impact
- Any suggestions for a fix (optional but appreciated)

## What to Expect

- We will acknowledge your report within **48 hours**.
- We will work with you to understand and validate the issue.
- We will develop and release a fix as quickly as possible, depending on severity.
- We will credit you in the release notes (unless you prefer to remain anonymous).

## Scope

This policy covers the Playshape application code, including:

- The Nuxt/Vue frontend
- Nitro server routes and API endpoints
- Electron main and preload processes
- Capacitor native integration
- Database schema and migrations
- LLM provider integrations

Out of scope:

- Vulnerabilities in third-party dependencies (report these to the upstream project, but let us know so we can update)
- Issues with the user's own LLM provider configuration or API keys
- Social engineering attacks

## Security Design

Playshape is designed with security in mind:

- **Local-first architecture** — data stays on the user's machine, minimizing attack surface
- **No telemetry or analytics** — zero network requests except to the user's chosen LLM provider and the update server
- **Sandboxed previews** — generated activities render in sandboxed iframes with restricted permissions
- **Input validation** — Zod schemas validate all data boundaries (LLM outputs, user input, IPC messages)
- **Content Security Policy** — configured for both Electron and web contexts
- **Signed updates** — desktop auto-updates verify code signatures

## Supported Versions

As Playshape is currently in alpha, only the latest version on the `master` branch is supported with security fixes. Once we reach stable releases, we will define a formal support policy.
