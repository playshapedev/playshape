import { eq, and } from 'drizzle-orm'
import { templateMigrations, templateVersions } from '../database/schema'
import { runMigration } from './runMigration'
import { validateDataAgainstSchema } from './buildZodFromInputSchema'
import type { TemplateField } from '../database/schema'

export interface MigrationChainResult {
  success: true
  data: Record<string, unknown>
  migrationsApplied: number
}

export interface MigrationChainError {
  success: false
  error: string
  failedAtVersion?: number
  validationErrors?: string[]
}

export type MigrationChainOutcome = MigrationChainResult | MigrationChainError

/**
 * Migrates activity data from one template version to another by running
 * all intermediate migrations in sequence.
 *
 * For example, to migrate from v1 to v3:
 * 1. Run v1→v2 migration
 * 2. Run v2→v3 migration
 * 3. Validate final result against v3 schema
 *
 * @param templateId - The template ID
 * @param data - The current activity data
 * @param fromVersion - The version the data currently conforms to
 * @param toVersion - The target version
 * @returns The migrated data or an error
 */
export async function migrateActivityData(
  templateId: string,
  data: Record<string, unknown>,
  fromVersion: number,
  toVersion: number,
): Promise<MigrationChainOutcome> {
  if (fromVersion >= toVersion) {
    return {
      success: true,
      data,
      migrationsApplied: 0,
    }
  }

  const db = useDb()

  // Fetch all migrations for this template in order
  const migrations = db
    .select()
    .from(templateMigrations)
    .where(eq(templateMigrations.templateId, templateId))
    .all()
    .sort((a, b) => a.fromVersion - b.fromVersion)

  // Build migration path
  let currentData = { ...data }
  let currentVersion = fromVersion
  let migrationsApplied = 0

  while (currentVersion < toVersion) {
    // Find migration for current version
    const migration = migrations.find(m => m.fromVersion === currentVersion)

    if (!migration) {
      return {
        success: false,
        error: `No migration found from version ${currentVersion} to ${currentVersion + 1}`,
        failedAtVersion: currentVersion,
      }
    }

    if (migration.toVersion !== currentVersion + 1) {
      return {
        success: false,
        error: `Invalid migration: expected v${currentVersion}→v${currentVersion + 1}, found v${migration.fromVersion}→v${migration.toVersion}`,
        failedAtVersion: currentVersion,
      }
    }

    // Run the migration
    const result = await runMigration(migration.migrationFn, currentData)

    if (!result.success) {
      return {
        success: false,
        error: `Migration v${currentVersion}→v${currentVersion + 1} failed: ${result.error}`,
        failedAtVersion: currentVersion,
      }
    }

    currentData = result.data
    currentVersion = migration.toVersion
    migrationsApplied++
  }

  // Validate final result against target version's schema
  const targetVersion = db
    .select()
    .from(templateVersions)
    .where(
      and(
        eq(templateVersions.templateId, templateId),
        eq(templateVersions.version, toVersion),
      ),
    )
    .get()

  if (!targetVersion) {
    return {
      success: false,
      error: `Target version ${toVersion} not found`,
      failedAtVersion: toVersion,
    }
  }

  const validation = validateDataAgainstSchema(
    currentData,
    targetVersion.inputSchema as TemplateField[] | null,
  )

  if (!validation.success) {
    return {
      success: false,
      error: `Migrated data does not match version ${toVersion} schema`,
      failedAtVersion: toVersion,
      validationErrors: validation.errors,
    }
  }

  return {
    success: true,
    data: currentData,
    migrationsApplied,
  }
}

/**
 * Tests a migration function against sample data and validates the result.
 *
 * @param migrationFn - The migration function to test
 * @param sampleData - Sample data to migrate
 * @param targetSchema - The schema the result should conform to
 * @returns Success with migrated data, or error details
 */
export async function testMigration(
  migrationFn: string,
  sampleData: Record<string, unknown>,
  targetSchema: TemplateField[] | null | undefined,
): Promise<MigrationChainOutcome> {
  // Run the migration
  const result = await runMigration(migrationFn, sampleData)

  if (!result.success) {
    return {
      success: false,
      error: result.error,
    }
  }

  // Validate against target schema
  const validation = validateDataAgainstSchema(result.data, targetSchema)

  if (!validation.success) {
    return {
      success: false,
      error: 'Migrated data does not match target schema',
      validationErrors: validation.errors,
    }
  }

  return {
    success: true,
    data: result.data,
    migrationsApplied: 1,
  }
}
