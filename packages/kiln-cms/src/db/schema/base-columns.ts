import { integer, text } from 'drizzle-orm/sqlite-core'
import { generateId } from '../../core/utils/gen-id'

/**
 * Base columns for all tables
 * Includes: id, createdAt, updatedAt, deletedAt
 */
export const baseColumns = {
  id: text('id')
    .primaryKey()
    .$defaultFn(() => generateId()),
  createdAt: integer('created_at', { mode: 'timestamp_ms' })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
    .notNull()
    .$defaultFn(() => new Date())
    .$onUpdateFn(() => new Date()),
  deletedAt: integer('deleted_at', { mode: 'timestamp_ms' }),
}
