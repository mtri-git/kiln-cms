import { and, asc, eq, ne } from 'drizzle-orm'
import { db, Errors, emitChange, findOne, listPage, releasedValue } from 'kiln-cms'
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
  list(query: ListTagsQuery) {
    return listPage(tags, { orderBy: [asc(tags.name)], query })
  },

  getById(id: string): Promise<Tag> {
    return findOne(tags, eq(tags.id, id), 'Tag')
  },

  getBySlug(slug: string): Promise<Tag> {
    return findOne(tags, eq(tags.slug, slug), 'Tag')
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
