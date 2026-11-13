import { createRoute } from '@hono/zod-openapi'
import {
  bearer,
  created,
  createRouter,
  currentUser,
  errors,
  idParam,
  jsonBody,
  ok,
  okResponse,
  pageResponse,
  paginated,
  requireAuth,
} from 'kiln-cms'
import { listMediaQuery, mediaSchema, updateMediaSchema, uploadMediaSchema } from './media.schemas'
import { mediaService } from './media.service'

const TAG = 'Media - Admin'
const router = createRouter()

router.use('*', requireAuth)

router.openapi(
  createRoute({
    method: 'get',
    path: '/',
    tags: [TAG],
    summary: 'List media, newest first',
    security: bearer,
    request: { query: listMediaQuery },
    responses: { 200: pageResponse(mediaSchema), ...errors.validation, ...errors.unauthorized },
  }),
  async (c) => {
    const { rows, total, params } = await mediaService.list(c.req.valid('query'))
    return paginated(c, rows, total, params)
  },
)

router.openapi(
  createRoute({
    method: 'get',
    path: '/{id}',
    tags: [TAG],
    summary: 'Get a media item by id',
    security: bearer,
    request: { params: idParam },
    responses: { 200: okResponse(mediaSchema), ...errors.unauthorized, ...errors.notFound },
  }),
  async (c) => ok(c, await mediaService.getById(c.req.valid('param').id)),
)

router.openapi(
  createRoute({
    method: 'post',
    path: '/',
    tags: [TAG],
    summary: 'Upload a file (max 10 MB; jpeg, png, webp, gif, avif, svg, pdf)',
    security: bearer,
    request: {
      body: { required: true, content: { 'multipart/form-data': { schema: uploadMediaSchema } } },
    },
    responses: { 201: okResponse(mediaSchema, 'Created'), ...errors.validation, ...errors.unauthorized },
  }),
  async (c) => created(c, await mediaService.create(c.req.valid('form'), currentUser(c).userId)),
)

router.openapi(
  createRoute({
    method: 'patch',
    path: '/{id}',
    tags: [TAG],
    summary: 'Update alt text and dimensions',
    security: bearer,
    request: { params: idParam, body: jsonBody(updateMediaSchema) },
    responses: {
      200: okResponse(mediaSchema),
      ...errors.validation,
      ...errors.unauthorized,
      ...errors.notFound,
    },
  }),
  async (c) => ok(c, await mediaService.update(c.req.valid('param').id, c.req.valid('json'))),
)

router.openapi(
  createRoute({
    method: 'delete',
    path: '/{id}',
    tags: [TAG],
    summary: 'Delete a media item and its file',
    security: bearer,
    request: { params: idParam },
    responses: { 200: okResponse(idParam), ...errors.unauthorized, ...errors.notFound },
  }),
  async (c) => {
    const { id } = c.req.valid('param')
    await mediaService.remove(id)
    return ok(c, { id })
  },
)

export { router as mediaAdminRouter }
