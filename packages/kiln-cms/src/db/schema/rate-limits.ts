import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { baseColumns } from './base-columns'

// Exception to soft delete: one counter row per key, hard-deleted when its window ends; deletedAt stays unused.
export const rateLimits = sqliteTable('rate_limits', {
  ...baseColumns,
  /** `<limiter name>:<client IP>`. */
  key: text('key').notNull().unique(),
  /** Requests seen in the current window. */
  count: integer('count').notNull().default(0),
  windowStartedAt: integer('window_started_at', { mode: 'timestamp_ms' }).notNull(),
})

export type RateLimit = typeof rateLimits.$inferSelect
export type NewRateLimit = typeof rateLimits.$inferInsert
