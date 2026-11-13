import { and, asc, count, eq, ne } from 'drizzle-orm'
import { db, Errors, emitChange, getPaginationParams, notDeleted, releasedValue } from 'kiln-cms'
import { type Tag, tags } from '../../db/schema'
import type { CreateTagInput, ListTagsQuery, UpdateTagInput } from './tags.schemas'

async function assertSlugFree(slug: string, exceptId?: string): Promise<void> {
  const [taken] = await db
    .select({ id: tags.id })
    .from(tags)
    .where(and(eq(tags.slug, slug), exceptId ? ne(tags.id, exceptId) : undefined))
    .limit(1)
  if (taken) throw Errors.CONFLICT('Slug already exists')
}

export const tagsService = {
  async list(query: ListTagsQuery) {
    const params = getPaginationParams(query)
    const where = notDeleted(tags)
    const [rows, [{ total }]] = await Promise.all([
      db.select().from(tags).where(where).orderBy(asc(tags.name)).limit(params.limit).offset(params.offset),
      db.select({ total: count() }).from(tags).where(where),
    ])
    return { rows, total, params }
  },

  async getById(id: string): Promise<Tag> {
    const [row] = await db
      .select()
      .from(tags)
      .where(and(eq(tags.id, id), notDeleted(tags)))
      .limit(1)
    if (!row) throw Errors.NOT_FOUND('Tag')
    return row
  },

  async getBySlug(slug: string): Promise<Tag> {
    const [row] = await db
      .select()
      .from(tags)
      .where(and(eq(tags.slug, slug), notDeleted(tags)))
      .limit(1)
    if (!row) throw Errors.NOT_FOUND('Tag')
    return row
  },

  async create(input: CreateTagInput): Promise<Tag> {
    await assertSlugFree(input.slug)
    const [row] = await db.insert(tags).values(input).returning()
    emitChange('tags', 'created', row.id)
    return row
  },

  /** Only the keys present in `input` change; `null` clears a nullable column. */
  async update(id: string, input: UpdateTagInput): Promise<Tag> {
    await this.getById(id)
    if (input.slug) await assertSlugFree(input.slug, id)
    const [row] = await db.update(tags).set(input).where(eq(tags.id, id)).returning()
    emitChange('tags', 'updated', id)
    return row
  },

  async remove(id: string): Promise<void> {
    const row = await this.getById(id)
    await db
      .update(tags)
      .set({ deletedAt: new Date(), slug: releasedValue(row.slug, row.id) })
      .where(eq(tags.id, id))
    emitChange('tags', 'deleted', id)
  },
}
