import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core'
import { baseColumns } from './base-columns'
import { users } from './users'

// Exception to soft delete: sessions are hard-deleted (one row per refresh token); deletedAt stays unused.
export const sessions = sqliteTable(
  'sessions',
  {
    ...baseColumns,
    userId: text('user_id')
      .notNull()
      .references(() => users.id),
    tokenHash: text('token_hash').notNull().unique(),
    expiresAt: integer('expires_at', { mode: 'timestamp_ms' }).notNull(),
  },
  (table) => [index('idx_sessions_user_id').on(table.userId)],
)

export type Session = typeof sessions.$inferSelect
export type NewSession = typeof sessions.$inferInsert
