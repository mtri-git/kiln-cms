import { and, count, desc, eq, like } from 'drizzle-orm'
import {
  db,
  Errors,
  emitChange,
  generateId,
  getEnv,
  getFilesBaseUrl,
  getPaginationParams,
  notDeleted,
  releasedValue,
} from 'kiln-cms'
import { type Media, media } from '../../db/schema'
import {
  ALLOWED_CONTENT_TYPES,
  type ListMediaQuery,
  MAX_FILE_SIZE,
  type UpdateMediaInput,
  type UploadMediaInput,
} from './media.schemas'

/** Row plus its public URL. */
const toMedia = (row: Media) => ({ ...row, url: `${getFilesBaseUrl()}/${row.key}` })

/** Lowercase, only a-z 0-9 . - ; never empty. */
function sanitizeFileName(name: string): string {
  const clean = name
    .toLowerCase()
    .replace(/[^a-z0-9.-]+/g, '-')
    .replace(/-{2,}/g, '-')
    .replace(/^[-.]+|-+$/g, '')
    .slice(-100)
  return clean || 'file'
}

function buildKey(fileName: string): string {
  const now = new Date()
  const month = String(now.getUTCMonth() + 1).padStart(2, '0')
  return `${now.getUTCFullYear()}/${month}/${generateId(12)}-${sanitizeFileName(fileName)}`
}

export const mediaService = {
  async list(query: ListMediaQuery) {
    const params = getPaginationParams(query)
    const where = and(notDeleted(media), query.search ? like(media.fileName, `%${query.search}%`) : undefined)
    const [rows, [{ total }]] = await Promise.all([
      db.select().from(media).where(where).orderBy(desc(media.createdAt)).limit(params.limit).offset(params.offset),
      db.select({ total: count() }).from(media).where(where),
    ])
    return { rows: rows.map(toMedia), total, params }
  },

  async getRow(id: string): Promise<Media> {
    const [row] = await db
      .select()
      .from(media)
      .where(and(eq(media.id, id), notDeleted(media)))
      .limit(1)
    if (!row) throw Errors.NOT_FOUND('Media')
    return row
  },

  async getById(id: string) {
    return toMedia(await this.getRow(id))
  },

  async create(input: UploadMediaInput, userId: string) {
    const { file } = input
    if (file.size > MAX_FILE_SIZE) throw Errors.BAD_REQUEST('File is larger than 10 MB')
    if (!ALLOWED_CONTENT_TYPES.includes(file.type)) {
      throw Errors.BAD_REQUEST(`File type not allowed: ${file.type || 'unknown'}`)
    }

    const key = buildKey(file.name)
    const bucket = getEnv().BUCKET
    await bucket.put(key, await file.arrayBuffer(), { httpMetadata: { contentType: file.type } })
    try {
      const [row] = await db
        .insert(media)
        .values({
          fileName: file.name,
          key,
          contentType: file.type,
          size: file.size,
          alt: input.alt,
          width: input.width,
          height: input.height,
          uploadedBy: userId,
        })
        .returning()
      emitChange('media', 'created', row.id)
      return toMedia(row)
    } catch (error) {
      await bucket.delete(key)
      throw error
    }
  },

  /** Only the keys present in `input` change; `null` clears a nullable column. */
  async update(id: string, input: UpdateMediaInput) {
    await this.getRow(id)
    const [row] = await db.update(media).set(input).where(eq(media.id, id)).returning()
    emitChange('media', 'updated', id)
    return toMedia(row)
  },

  async remove(id: string): Promise<void> {
    const row = await this.getRow(id)
    await db
      .update(media)
      .set({ deletedAt: new Date(), key: releasedValue(row.key, row.id) })
      .where(eq(media.id, id))
    await getEnv().BUCKET.delete(row.key)
    emitChange('media', 'deleted', id)
  },

  /** The R2 object behind a public file URL. `encodedKey` is the percent-encoded path after `/files/`. */
  async getFile(encodedKey: string): Promise<R2ObjectBody> {
    let key: string
    try {
      key = decodeURIComponent(encodedKey)
    } catch {
      throw Errors.BAD_REQUEST('Invalid file key')
    }
    if (!key || key.includes('..')) throw Errors.BAD_REQUEST('Invalid file key')
    const object = await getEnv().BUCKET.get(key)
    if (!object) throw Errors.NOT_FOUND('File')
    return object
  },
}
