import { eq } from 'drizzle-orm'
import { emitChange } from '../../core/hooks'
import { db } from '../../db'
import { type GlobalRow, globals } from '../../db/schema/globals'
import type { GlobalValue } from './globals.schemas'

const toValue = (row: GlobalRow): GlobalValue => ({ name: row.name, data: row.data, updatedAt: row.updatedAt })

export const globalsService = {
  /** The stored document, or `data: null` when it was never saved. */
  async get(name: string): Promise<GlobalValue> {
    const [row] = await db.select().from(globals).where(eq(globals.name, name)).limit(1)
    return row ? toValue(row) : { name, data: null, updatedAt: null }
  },

  /** Replaces the whole document. */
  async put(name: string, data: unknown, userId: string | null): Promise<GlobalValue> {
    const now = new Date()
    const [row] = await db
      .insert(globals)
      .values({ name, data, updatedAt: now, updatedBy: userId })
      .onConflictDoUpdate({ target: globals.name, set: { data, updatedAt: now, updatedBy: userId } })
      .returning()
    emitChange('globals', 'updated', name)
    return toValue(row)
  },
}
