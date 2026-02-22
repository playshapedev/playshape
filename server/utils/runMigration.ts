import ivm from 'isolated-vm'

export interface MigrationResult {
  success: true
  data: Record<string, unknown>
}

export interface MigrationError {
  success: false
  error: string
}

export type MigrationOutcome = MigrationResult | MigrationError

/**
 * Executes a migration function in an isolated V8 sandbox.
 *
 * The migration function receives the old data and should return the transformed data.
 * It runs in a completely isolated environment with no access to Node.js APIs,
 * file system, network, or any globals beyond basic JavaScript.
 *
 * @param migrationFn - JavaScript function body that transforms data.
 *                      Receives `data` as a parameter and should return the new data.
 *                      Example: "return { ...data, newField: data.oldField || 'default' }"
 * @param data - The activity data to migrate
 * @param options - Execution limits
 * @returns The migrated data or an error
 */
export async function runMigration(
  migrationFn: string,
  data: Record<string, unknown>,
  options: {
    timeout?: number // milliseconds, default 5000
    memoryLimit?: number // MB, default 8
  } = {},
): Promise<MigrationOutcome> {
  const timeout = options.timeout ?? 5000
  const memoryLimit = options.memoryLimit ?? 8

  let isolate: ivm.Isolate | null = null

  try {
    // Create an isolated V8 instance with memory limits
    isolate = new ivm.Isolate({ memoryLimit })

    // Create a new context (like a fresh browser tab)
    const context = await isolate.createContext()

    // Get the global object in the isolate
    const jail = context.global

    // Make `global` available (some code expects it)
    await jail.set('global', jail.derefInto())

    // Create a copy of the data that can be accessed in the isolate
    const dataCopy = new ivm.ExternalCopy(data).copyInto()

    // Wrap the migration function in an IIFE that returns JSON
    // This ensures we get a serializable result back
    const wrappedCode = `
      (function() {
        const data = ${JSON.stringify(data)};
        const migrationFn = function(data) {
          ${migrationFn}
        };
        const result = migrationFn(data);
        return JSON.stringify(result);
      })()
    `

    // Compile and run the script
    const script = await isolate.compileScript(wrappedCode)
    const resultJson = await script.run(context, { timeout })

    // Parse the result
    if (typeof resultJson !== 'string') {
      return {
        success: false,
        error: 'Migration function did not return a valid result',
      }
    }

    const result = JSON.parse(resultJson)

    if (result === null || typeof result !== 'object' || Array.isArray(result)) {
      return {
        success: false,
        error: 'Migration function must return an object',
      }
    }

    return {
      success: true,
      data: result as Record<string, unknown>,
    }
  }
  catch (err) {
    // Handle specific error types
    if (err instanceof Error) {
      if (err.message.includes('Script execution timed out')) {
        return {
          success: false,
          error: `Migration timed out after ${timeout}ms. The function may have an infinite loop.`,
        }
      }
      if (err.message.includes('Isolate was disposed')) {
        return {
          success: false,
          error: 'Migration exceeded memory limit',
        }
      }
      return {
        success: false,
        error: `Migration failed: ${err.message}`,
      }
    }
    return {
      success: false,
      error: 'Migration failed with an unknown error',
    }
  }
  finally {
    // Clean up the isolate to free memory
    if (isolate) {
      isolate.dispose()
    }
  }
}

/**
 * Validates that a migration function string is syntactically valid JavaScript.
 * Does not execute the function - just checks for syntax errors.
 *
 * @param migrationFn - The function body to validate
 * @returns null if valid, or an error message if invalid
 */
export function validateMigrationSyntax(migrationFn: string): string | null {
  try {
    // Try to parse the function body by wrapping it
    // eslint-disable-next-line no-new-func
    new Function('data', migrationFn)
    return null
  }
  catch (err) {
    if (err instanceof SyntaxError) {
      return `Syntax error: ${err.message}`
    }
    return 'Invalid JavaScript syntax'
  }
}
