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
import { categorySchema, createCategorySchema, listCategoriesQuery, updateCategorySchema } from './categories.schemas'
import { categoriesService } from './categories.service'

const TAG = 'Categories - Admin'
const router = createRouter()

router.use('*', requireAuth)

router.openapi(
  createRoute({
    method: 'get',
    path: '/',
    tags: [TAG],
    summary: 'List categories',
    security: bearer,
    request: { query: listCategoriesQuery },
    responses: { 200: pageResponse(categorySchema), ...errors.validation, ...errors.unauthorized },
  }),
  async (c) => {
    const { rows, total, params } = await categoriesService.list(c.req.valid('query'))
    return paginated(c, rows, total, params)
  },
)

router.openapi(
  createRoute({
    method: 'get',
    path: '/{id}',
    tags: [TAG],
    summary: 'Get a category by id',
    security: bearer,
    request: { params: idParam },
    responses: { 200: okResponse(categorySchema), ...errors.unauthorized, ...errors.notFound },
  }),
  async (c) => ok(c, await categoriesService.getById(c.req.valid('param').id)),
)

router.openapi(
  createRoute({
    method: 'post',
    path: '/',
    tags: [TAG],
    summary: 'Create a category',
    security: bearer,
    request: { body: jsonBody(createCategorySchema) },
    responses: {
      201: okResponse(categorySchema, 'Created'),
      ...errors.validation,
      ...errors.unauthorized,
      ...errors.conflict,
    },
  }),
  async (c) => created(c, await categoriesService.create(c.req.valid('json'))),
)

router.openapi(
  createRoute({
    method: 'patch',
    path: '/{id}',
    tags: [TAG],
    summary: 'Update a category',
    security: bearer,
    request: { params: idParam, body: jsonBody(updateCategorySchema) },
    responses: {
      200: okResponse(categorySchema),
      ...errors.validation,
      ...errors.unauthorized,
      ...errors.notFound,
      ...errors.conflict,
    },
  }),
  async (c) => ok(c, await categoriesService.update(c.req.valid('param').id, c.req.valid('json'))),
)

router.openapi(
  createRoute({
    method: 'delete',
    path: '/{id}',
    tags: [TAG],
    summary: 'Delete a category',
    security: bearer,
    request: { params: idParam },
    responses: { 200: okResponse(idParam), ...errors.unauthorized, ...errors.notFound },
  }),
  async (c) => {
    const { id } = c.req.valid('param')
    await categoriesService.remove(id)
    return ok(c, { id })
  },
)

export { router as categoriesAdminRouter }
