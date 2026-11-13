import { and, asc, count, desc, eq, getTableColumns, inArray, ne, notInArray, sql } from 'drizzle-orm'
import type { BatchItem } from 'drizzle-orm/batch'
import { db, Errors, emitChange, generateId, getPaginationParams, notDeleted, releasedValue } from 'kiln-cms'
import { categories, type Post, posts, postTags, revisions, tags } from '../../db/schema'
import type {
  CreatePostInput,
  ListAdminPostsQuery,
  ListPublicPostsQuery,
  PostSnapshot,
  UpdatePostInput,
} from './posts.schemas'
import { postSnapshotSchema } from './posts.schemas'

const MAX_REVISIONS = 10

type Ref = { id: string; name: string; slug: string }
type ListRow = Omit<Post, 'content' | 'deletedAt'>

const { content: _content, deletedAt: _deletedAt, ...listColumns } = getTableColumns(posts)

/** LIKE pattern matching `term` anywhere, with wildcards in `term` escaped. */
const containsPattern = (term: string) => `%${term.replace(/[\\%_]/g, '\\$&')}%`

const titleLike = (term: string) => sql`${posts.title} LIKE ${containsPattern(term)} ESCAPE '\\'`

async function assertSlugFree(slug: string, exceptId?: string): Promise<void> {
  const [taken] = await db
    .select({ id: posts.id })
    .from(posts)
    .where(and(eq(posts.slug, slug), exceptId ? ne(posts.id, exceptId) : undefined))
    .limit(1)
  if (taken) throw Errors.CONFLICT('Slug already exists')
}

async function assertRefsExist(categoryId: string | null | undefined, tagIds: string[] | undefined): Promise<void> {
  if (categoryId) {
    const [found] = await db
      .select({ id: categories.id })
      .from(categories)
      .where(and(eq(categories.id, categoryId), notDeleted(categories)))
      .limit(1)
    if (!found) throw Errors.BAD_REQUEST('Category does not exist')
  }
  if (tagIds && tagIds.length > 0) {
    const found = await db
      .select({ id: tags.id })
      .from(tags)
      .where(and(inArray(tags.id, tagIds), notDeleted(tags)))
    if (found.length !== tagIds.length) throw Errors.BAD_REQUEST('One or more tags do not exist')
  }
}

/** Attaches `category` and `tags` to a page of posts with two queries, not one per post. */
async function withRelations<T extends ListRow>(rows: T[]): Promise<(T & { category: Ref | null; tags: Ref[] })[]> {
  if (rows.length === 0) return []
  const postIds = rows.map((row) => row.id)
  const categoryIds = [...new Set(rows.flatMap((row) => (row.categoryId ? [row.categoryId] : [])))]

  const [tagRows, categoryRows] = await Promise.all([
    db
      .select({ postId: postTags.postId, id: tags.id, name: tags.name, slug: tags.slug })
      .from(postTags)
      .innerJoin(tags, eq(tags.id, postTags.tagId))
      .where(and(inArray(postTags.postId, postIds), notDeleted(tags)))
      .orderBy(asc(tags.name)),
    categoryIds.length === 0
      ? Promise.resolve<Ref[]>([])
      : db
          .select({ id: categories.id, name: categories.name, slug: categories.slug })
          .from(categories)
          .where(and(inArray(categories.id, categoryIds), notDeleted(categories))),
  ])

  const tagsByPost = new Map<string, Ref[]>()
  for (const { postId, ...ref } of tagRows) {
    const list = tagsByPost.get(postId)
    if (list) list.push(ref)
    else tagsByPost.set(postId, [ref])
  }
  const categoryById = new Map(categoryRows.map((category) => [category.id, category]))

  return rows.map((row) => ({
    ...row,
    category: row.categoryId ? (categoryById.get(row.categoryId) ?? null) : null,
    tags: tagsByPost.get(row.id) ?? [],
  }))
}

async function toView(row: Post) {
  const { deletedAt: _removed, ...rest } = row
  const [view] = await withRelations([rest])
  return view
}

async function findRow(id: string): Promise<Post> {
  const [row] = await db
    .select()
    .from(posts)
    .where(and(eq(posts.id, id), notDeleted(posts)))
    .limit(1)
  if (!row) throw Errors.NOT_FOUND('Post')
  return row
}

async function getTagIds(postId: string): Promise<string[]> {
  const rows = await db.select({ tagId: postTags.tagId }).from(postTags).where(eq(postTags.postId, postId))
  return rows.map((row) => row.tagId)
}

/** Statements that replace a post's whole tag set. Join rows are hard-deleted. */
function replaceTagStatements(postId: string, tagIds: string[]): BatchItem<'sqlite'>[] {
  const statements: BatchItem<'sqlite'>[] = [db.delete(postTags).where(eq(postTags.postId, postId))]
  if (tagIds.length > 0) {
    statements.push(db.insert(postTags).values(tagIds.map((tagId) => ({ postId, tagId }))))
  }
  return statements
}

async function runBatch(statements: [BatchItem<'sqlite'>, ...BatchItem<'sqlite'>[]]): Promise<void> {
  await db.batch(statements)
}

function snapshotOf(row: Post, tagIds: string[]): PostSnapshot {
  return {
    title: row.title,
    slug: row.slug,
    excerpt: row.excerpt,
    content: row.content ?? null,
    coverImageUrl: row.coverImageUrl,
    categoryId: row.categoryId,
    isFeatured: row.isFeatured,
    metaTitle: row.metaTitle,
    metaDescription: row.metaDescription,
    metaKeywords: row.metaKeywords,
    tagIds,
  }
}

export const postsService = {
  async listPublished(query: ListPublicPostsQuery) {
    const params = getPaginationParams(query)
    const where = and(
      notDeleted(posts),
      eq(posts.status, 'published'),
      query.category
        ? inArray(
            posts.categoryId,
            db
              .select({ id: categories.id })
              .from(categories)
              .where(and(eq(categories.slug, query.category), notDeleted(categories))),
          )
        : undefined,
      query.tag
        ? inArray(
            posts.id,
            db
              .select({ id: postTags.postId })
              .from(postTags)
              .innerJoin(tags, eq(tags.id, postTags.tagId))
              .where(and(eq(tags.slug, query.tag), notDeleted(tags))),
          )
        : undefined,
      query.featured ? eq(posts.isFeatured, query.featured === 'true') : undefined,
      query.search ? titleLike(query.search) : undefined,
    )
    const [rows, [{ total }]] = await Promise.all([
      db
        .select(listColumns)
        .from(posts)
        .where(where)
        .orderBy(desc(posts.publishedAt), desc(posts.id))
        .limit(params.limit)
        .offset(params.offset),
      db.select({ total: count() }).from(posts).where(where),
    ])
    return { rows: await withRelations(rows), total, params }
  },

  async getPublishedBySlug(slug: string) {
    const [row] = await db
      .select()
      .from(posts)
      .where(and(eq(posts.slug, slug), eq(posts.status, 'published'), notDeleted(posts)))
      .limit(1)
    if (!row) throw Errors.NOT_FOUND('Post')
    return toView(row)
  },

  async list(query: ListAdminPostsQuery) {
    const params = getPaginationParams(query)
    const where = and(
      notDeleted(posts),
      query.status ? eq(posts.status, query.status) : undefined,
      query.categoryId ? eq(posts.categoryId, query.categoryId) : undefined,
      query.search ? titleLike(query.search) : undefined,
    )
    const [rows, [{ total }]] = await Promise.all([
      db
        .select(listColumns)
        .from(posts)
        .where(where)
        .orderBy(desc(posts.updatedAt), desc(posts.id))
        .limit(params.limit)
        .offset(params.offset),
      db.select({ total: count() }).from(posts).where(where),
    ])
    return { rows: await withRelations(rows), total, params }
  },

  async getById(id: string) {
    return toView(await findRow(id))
  },

  async create(input: CreatePostInput, authorId: string) {
    const { tagIds: rawTagIds, ...fields } = input
    const tagIds = [...new Set(rawTagIds ?? [])]
    await assertSlugFree(fields.slug)
    await assertRefsExist(fields.categoryId, tagIds)
    const id = generateId()
    await runBatch([
      db.insert(posts).values({ ...fields, id, authorId, status: 'draft' }),
      ...(tagIds.length > 0 ? [db.insert(postTags).values(tagIds.map((tagId) => ({ postId: id, tagId })))] : []),
    ])
    emitChange('posts', 'created', id)
    return this.getById(id)
  },

  /** Only the keys present in `input` change; `tagIds`, when present, replaces the whole tag set. Status never changes here. */
  async update(id: string, input: UpdatePostInput) {
    await findRow(id)
    const { tagIds: rawTagIds, ...fields } = input
    const tagIds = rawTagIds ? [...new Set(rawTagIds)] : undefined
    if (fields.slug) await assertSlugFree(fields.slug, id)
    await assertRefsExist(fields.categoryId, tagIds)
    await runBatch([
      db
        .update(posts)
        .set({ ...fields, updatedAt: new Date() })
        .where(eq(posts.id, id)),
      ...(tagIds ? replaceTagStatements(id, tagIds) : []),
    ])
    emitChange('posts', 'updated', id)
    return this.getById(id)
  },

  async remove(id: string): Promise<void> {
    const row = await findRow(id)
    await db
      .update(posts)
      .set({ deletedAt: new Date(), slug: releasedValue(row.slug, row.id) })
      .where(eq(posts.id, id))
    emitChange('posts', 'deleted', id)
  },

  /** Publishes the post, stores a revision, and keeps only the newest revisions. */
  async publish(id: string, userId: string) {
    const row = await findRow(id)
    const snapshot = snapshotOf(row, await getTagIds(id))
    await runBatch([
      db
        .update(posts)
        .set({ status: 'published', publishedAt: row.publishedAt ?? new Date(), updatedAt: new Date() })
        .where(eq(posts.id, id)),
      db.insert(revisions).values({ postId: id, snapshot, createdBy: userId }),
      // Exception to soft delete: old revisions are history, not content, so they are hard-deleted.
      db
        .delete(revisions)
        .where(
          and(
            eq(revisions.postId, id),
            notInArray(
              revisions.id,
              db
                .select({ id: revisions.id })
                .from(revisions)
                .where(eq(revisions.postId, id))
                .orderBy(desc(revisions.createdAt), desc(revisions.id))
                .limit(MAX_REVISIONS),
            ),
          ),
        ),
    ])
    emitChange('posts', 'published', id)
    return this.getById(id)
  },

  /** Back to draft. `publishedAt` is kept. */
  async unpublish(id: string) {
    await findRow(id)
    await db.update(posts).set({ status: 'draft', updatedAt: new Date() }).where(eq(posts.id, id))
    emitChange('posts', 'unpublished', id)
    return this.getById(id)
  },

  async listRevisions(postId: string) {
    await findRow(postId)
    return db
      .select({ id: revisions.id, createdAt: revisions.createdAt, createdBy: revisions.createdBy })
      .from(revisions)
      .where(and(eq(revisions.postId, postId), notDeleted(revisions)))
      .orderBy(desc(revisions.createdAt), desc(revisions.id))
  },

  /** Copies a revision's fields back onto the post. Status is unchanged. */
  async restoreRevision(postId: string, revisionId: string) {
    await findRow(postId)
    const [revision] = await db
      .select()
      .from(revisions)
      .where(and(eq(revisions.id, revisionId), eq(revisions.postId, postId), notDeleted(revisions)))
      .limit(1)
    if (!revision) throw Errors.NOT_FOUND('Revision')

    const parsed = postSnapshotSchema.safeParse(revision.snapshot)
    if (!parsed.success) throw Errors.INTERNAL_ERROR('Revision snapshot is unreadable')
    const { tagIds, ...fields } = parsed.data

    await assertSlugFree(fields.slug, postId)
    // The category or tags may have been deleted since the snapshot: drop those links instead of failing.
    const [category, liveTags] = await Promise.all([
      fields.categoryId
        ? db
            .select({ id: categories.id })
            .from(categories)
            .where(and(eq(categories.id, fields.categoryId), notDeleted(categories)))
            .limit(1)
        : Promise.resolve<{ id: string }[]>([]),
      tagIds.length > 0
        ? db
            .select({ id: tags.id })
            .from(tags)
            .where(and(inArray(tags.id, tagIds), notDeleted(tags)))
        : Promise.resolve<{ id: string }[]>([]),
    ])

    await runBatch([
      db
        .update(posts)
        .set({ ...fields, categoryId: category.length > 0 ? fields.categoryId : null, updatedAt: new Date() })
        .where(eq(posts.id, postId)),
      ...replaceTagStatements(
        postId,
        liveTags.map((tag) => tag.id),
      ),
    ])
    emitChange('posts', 'updated', postId)
    return this.getById(postId)
  },
}
