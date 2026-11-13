import { createRoute } from '@hono/zod-openapi'
import { currentUser, requireAuth, requireRole } from '../../core/middleware/auth'
import { bearer, createRouter, errors, idParam, jsonBody, okResponse, pageResponse } from '../../core/openapi'
import { created, ok, paginated } from '../../core/utils/response'
import { createUserSchema, listUsersQuery, updateUserSchema, userSchema } from './users.schemas'
import { usersService } from './users.service'

const TAG = 'Users - Admin'
const router = createRouter()

router.use('*', requireAuth)
router.use('*', requireRole('admin'))

router.openapi(
  createRoute({
    method: 'get',
    path: '/',
    tags: [TAG],
    summary: 'List users',
    security: bearer,
    request: { query: listUsersQuery },
    responses: { 200: pageResponse(userSchema), ...errors.validation, ...errors.unauthorized, ...errors.forbidden },
  }),
  async (c) => {
    const { rows, total, params } = await usersService.list(c.req.valid('query'))
    return paginated(c, rows, total, params)
  },
)

router.openapi(
  createRoute({
    method: 'get',
    path: '/{id}',
    tags: [TAG],
    summary: 'Get a user by id',
    security: bearer,
    request: { params: idParam },
    responses: { 200: okResponse(userSchema), ...errors.unauthorized, ...errors.forbidden, ...errors.notFound },
  }),
  async (c) => ok(c, await usersService.getById(c.req.valid('param').id)),
)

router.openapi(
  createRoute({
    method: 'post',
    path: '/',
    tags: [TAG],
    summary: 'Create a user',
    security: bearer,
    request: { body: jsonBody(createUserSchema) },
    responses: {
      201: okResponse(userSchema, 'Created'),
      ...errors.validation,
      ...errors.unauthorized,
      ...errors.forbidden,
      ...errors.conflict,
    },
  }),
  async (c) => created(c, await usersService.create(c.req.valid('json'))),
)

router.openapi(
  createRoute({
    method: 'patch',
    path: '/{id}',
    tags: [TAG],
    summary: 'Update a user',
    security: bearer,
    request: { params: idParam, body: jsonBody(updateUserSchema) },
    responses: {
      200: okResponse(userSchema),
      ...errors.validation,
      ...errors.unauthorized,
      ...errors.forbidden,
      ...errors.notFound,
    },
  }),
  async (c) => ok(c, await usersService.update(currentUser(c).userId, c.req.valid('param').id, c.req.valid('json'))),
)

router.openapi(
  createRoute({
    method: 'delete',
    path: '/{id}',
    tags: [TAG],
    summary: 'Delete a user',
    security: bearer,
    request: { params: idParam },
    responses: { 200: okResponse(idParam), ...errors.unauthorized, ...errors.forbidden, ...errors.notFound },
  }),
  async (c) => {
    const { id } = c.req.valid('param')
    await usersService.remove(currentUser(c).userId, id)
    return ok(c, { id })
  },
)

export { router as usersAdminRouter }
