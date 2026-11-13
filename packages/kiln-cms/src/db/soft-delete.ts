import { isNull, type SQL } from 'drizzle-orm'
import type { SQLiteColumn } from 'drizzle-orm/sqlite-core'

/**
 * Rows are never removed: deleting sets `deletedAt`. Every read must filter
 * with `notDeleted(table)` so deleted rows stay invisible.
 */
export const notDeleted = (table: { deletedAt: SQLiteColumn }): SQL => isNull(table.deletedAt)

/**
 * Value to store in a unique column (slug, email) when soft-deleting a row,
 * so the original value can be used again by a new row.
 */
export const releasedValue = (value: string, id: string): string => `${value}--deleted-${id}`
