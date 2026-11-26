import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'

/**
 * Globals: one document per name (a home page, a menu, site settings), declared with the `globals` option.
 * The name is the key, so there is no id, no list and no soft delete.
 */
export const globals = sqliteTable('globals', {
  name: text('name').primaryKey(),
  data: text('data', { mode: 'json' }).$type<unknown>().notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
    .notNull()
    .$defaultFn(() => new Date())
    .$onUpdateFn(() => new Date()),
  updatedBy: text('updated_by'),
})

export type GlobalRow = typeof globals.$inferSelect
