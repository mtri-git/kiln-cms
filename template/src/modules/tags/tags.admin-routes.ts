import { createRoute } from '@hono/zod-openapi'
import {
  bearer,
  created,
  createRouter,
  errors,
  idParam,
  jsonBody,
  ok,
  okResponse,
  pageResponse,
  paginated,
  requireAuth,
} from 'kiln-cms'
import { createTagSchema, listTagsQuery, tagSchema, updateTagSchema } from './tags.schemas'
import { tagsService } from './tags.service'

const TAG = 'Tags - Admin'
const router = createRouter()

router.use('*', requireAuth)

router.openapi(
  createRoute({
    method: 'get',
    path: '/',
    tags: [TAG],
    summary: 'List tags',
    security: bearer,
    request: { query: listTagsQuery },
    responses: { 200: pageResponse(tagSchema), ...errors.validation, ...errors.unauthorized },
  }),
  async (c) => {
    const { rows, total, params } = await tagsService.list(c.req.valid('query'))
    return paginated(c, rows, total, params)
  },
)

router.openapi(
  createRoute({
    method: 'get',
    path: '/{id}',
    tags: [TAG],
    summary: 'Get a tag by id',
    security: bearer,
    request: { params: idParam },
    responses: { 200: okResponse(tagSchema), ...errors.unauthorized, ...errors.notFound },
  }),
  async (c) => ok(c, await tagsService.getById(c.req.valid('param').id)),
)

router.openapi(
  createRoute({
    method: 'post',
    path: '/',
    tags: [TAG],
    summary: 'Create a tag',
    security: bearer,
    request: { body: jsonBody(createTagSchema) },
    responses: {
      201: okResponse(tagSchema, 'Created'),
      ...errors.validation,
      ...errors.unauthorized,
      ...errors.conflict,
    },
  }),
  async (c) => created(c, await tagsService.create(c.req.valid('json'))),
)

router.openapi(
  createRoute({
    method: 'patch',
    path: '/{id}',
    tags: [TAG],
    summary: 'Update a tag',
    security: bearer,
    request: { params: idParam, body: jsonBody(updateTagSchema) },
    responses: {
      200: okResponse(tagSchema),
      ...errors.validation,
      ...errors.unauthorized,
      ...errors.notFound,
      ...errors.conflict,
    },
  }),
  async (c) => ok(c, await tagsService.update(c.req.valid('param').id, c.req.valid('json'))),
)

router.openapi(
  createRoute({
    method: 'delete',
    path: '/{id}',
    tags: [TAG],
    summary: 'Delete a tag',
    security: bearer,
    request: { params: idParam },
    responses: { 200: okResponse(idParam), ...errors.unauthorized, ...errors.notFound },
  }),
  async (c) => {
    const { id } = c.req.valid('param')
    await tagsService.remove(id)
    return ok(c, { id })
  },
)

export { router as tagsAdminRouter }
