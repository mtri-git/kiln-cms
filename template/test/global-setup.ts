import { generateSQLiteDrizzleJson, generateSQLiteMigration } from 'drizzle-kit/api'
import type { TestProject } from 'vitest/node'
import * as schema from '../src/db/schema'

declare module 'vitest' {
  export interface ProvidedContext {
    schemaSql: string[]
  }
}

/**
 * Builds the CREATE TABLE / INDEX statements for the whole Drizzle schema (empty snapshot -> current schema).
 * No migrations folder is involved: a new table exported from src/db/schema/index.ts is picked up automatically.
 */
export default async function setup(project: TestProject) {
  const empty = await generateSQLiteDrizzleJson({})
  const current = await generateSQLiteDrizzleJson(schema)
  const statements = await generateSQLiteMigration(empty, current)
  project.provide('schemaSql', statements)
}
