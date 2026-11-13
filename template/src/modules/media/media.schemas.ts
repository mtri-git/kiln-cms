import { z } from '@hono/zod-openapi'
import { baseFields, pageQuery } from 'kiln-cms'

export const MAX_FILE_SIZE = 10 * 1024 * 1024

export const ALLOWED_CONTENT_TYPES: readonly string[] = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
  'image/avif',
  'image/svg+xml',
  'application/pdf',
]

/** What the API returns for one media item. `url` is computed from the key. */
export const mediaSchema = z
  .object({
    ...baseFields,
    fileName: z.string(),
    key: z.string(),
    contentType: z.string(),
    size: z.number().int(),
    alt: z.string().nullable(),
    width: z.number().int().nullable(),
    height: z.number().int().nullable(),
    uploadedBy: z.string().nullable(),
    url: z.string(),
  })
  .openapi('Media')

/** multipart/form-data: `width` and `height` are sent by the client, the Worker does not decode images. */
export const uploadMediaSchema = z
  .object({
    file: z.instanceof(File).openapi({ type: 'string', format: 'binary' }),
    alt: z.string().max(500).optional(),
    width: z.coerce.number().int().positive().optional(),
    height: z.coerce.number().int().positive().optional(),
  })
  .openapi('UploadMedia')

export const updateMediaSchema = z
  .object({
    alt: z.string().max(500).nullable().optional(),
    width: z.number().int().positive().nullable().optional(),
    height: z.number().int().positive().nullable().optional(),
  })
  .openapi('UpdateMedia')

export const listMediaQuery = pageQuery.extend({ search: z.string().min(1).optional() })

export type UploadMediaInput = z.infer<typeof uploadMediaSchema>
export type UpdateMediaInput = z.infer<typeof updateMediaSchema>
export type ListMediaQuery = z.infer<typeof listMediaQuery>
