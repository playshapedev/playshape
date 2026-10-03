#!/usr/bin/env npx tsx

/**
 * Exports a template from the local database to a JSON fixture file,
 * making it a bundled default template.
 *
 * Usage:
 *   pnpm run export-default <template-id> [--slug custom-slug]
 *
 * The dev server must be running (pnpm dev) for this script to work,
 * as it calls the dev-only API route.
 */

const args = process.argv.slice(2)

if (!args.length || args[0] === '--help') {
  console.log(`
Usage: pnpm run export-default <template-id> [--slug custom-slug]

Exports a template to server/database/defaults/templates/{kind}/{slug}.json
so it ships as a built-in default template.

Options:
  --slug <name>   Override the auto-derived slug (kebab-case identifier)

The Nuxt dev server must be running (pnpm dev).
`)
  process.exit(0)
}

const templateId = args[0]
const slugIdx = args.indexOf('--slug')
const slug = slugIdx !== -1 ? args[slugIdx + 1] : undefined

if (slugIdx !== -1 && !slug) {
  console.error('Error: --slug requires a value')
  process.exit(1)
}

const baseUrl = process.env.API_URL || 'http://localhost:3000'
const url = new URL(`/api/dev/export-default/${templateId}`, baseUrl)
if (slug) url.searchParams.set('slug', slug)

async function main() {
  try {
    const res = await fetch(url.toString(), { method: 'POST' })

    if (!res.ok) {
      const error = await res.text()
      console.error(`Error (${res.status}): ${error}`)
      process.exit(1)
    }

    const data = await res.json()
    console.log(`Exported: ${data.filePath}`)
    console.log(`Slug: ${data.slug}`)
    console.log(`Kind: ${data.kind}`)
    console.log(`\nThe template will be loaded as a default on next app restart.`)
  }
  catch (err) {
    console.error('Failed to connect to dev server. Is it running? (pnpm dev)')
    console.error(err instanceof Error ? err.message : err)
    process.exit(1)
  }
}

main()
