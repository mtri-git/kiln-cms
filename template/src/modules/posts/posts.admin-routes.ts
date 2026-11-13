import { createRoute, z } from '@hono/zod-openapi'
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
import {
  createPostSchema,
  listAdminPostsQuery,
  postListItemSchema,
  postSchema,
  revisionParam,
  revisionSchema,
  updatePostSchema,
} from './posts.schemas'
import { postsService } from './posts.service'

const TAG = 'Posts - Admin'
const router = createRouter()

router.use('*', requireAuth)

router.openapi(
  createRoute({
    method: 'get',
    path: '/',
    tags: [TAG],
    summary: 'List posts of any status',
    security: bearer,
    request: { query: listAdminPostsQuery },
    responses: { 200: pageResponse(postListItemSchema), ...errors.validation, ...errors.unauthorized },
  }),
  async (c) => {
    const { rows, total, params } = await postsService.list(c.req.valid('query'))
    return paginated(c, rows, total, params)
  },
)

router.openapi(
  createRoute({
    method: 'get',
    path: '/{id}',
    tags: [TAG],
    summary: 'Get a post by id',
    security: bearer,
    request: { params: idParam },
    responses: { 200: okResponse(postSchema), ...errors.unauthorized, ...errors.notFound },
  }),
  async (c) => ok(c, await postsService.getById(c.req.valid('param').id)),
)

router.openapi(
  createRoute({
    method: 'post',
    path: '/',
    tags: [TAG],
    summary: 'Create a draft post',
    security: bearer,
    request: { body: jsonBody(createPostSchema) },
    responses: {
      201: okResponse(postSchema, 'Created'),
      ...errors.validation,
      ...errors.unauthorized,
      ...errors.conflict,
    },
  }),
  async (c) => created(c, await postsService.create(c.req.valid('json'), currentUser(c).userId)),
)

router.openapi(
  createRoute({
    method: 'patch',
    path: '/{id}',
    tags: [TAG],
    summary: 'Update a post (does not change its status)',
    security: bearer,
    request: { params: idParam, body: jsonBody(updatePostSchema) },
    responses: {
      200: okResponse(postSchema),
      ...errors.validation,
      ...errors.unauthorized,
      ...errors.notFound,
      ...errors.conflict,
    },
  }),
  async (c) => ok(c, await postsService.update(c.req.valid('param').id, c.req.valid('json'))),
)

router.openapi(
  createRoute({
    method: 'delete',
    path: '/{id}',
    tags: [TAG],
    summary: 'Delete a post',
    security: bearer,
    request: { params: idParam },
    responses: { 200: okResponse(idParam), ...errors.unauthorized, ...errors.notFound },
  }),
  async (c) => {
    const { id } = c.req.valid('param')
    await postsService.remove(id)
    return ok(c, { id })
  },
)

router.openapi(
  createRoute({
    method: 'post',
    path: '/{id}/publish',
    tags: [TAG],
    summary: 'Publish a post and store a revision',
    security: bearer,
    request: { params: idParam },
    responses: { 200: okResponse(postSchema), ...errors.unauthorized, ...errors.notFound },
  }),
  async (c) => ok(c, await postsService.publish(c.req.valid('param').id, currentUser(c).userId)),
)

router.openapi(
  createRoute({
    method: 'post',
    path: '/{id}/unpublish',
    tags: [TAG],
    summary: 'Turn a post back into a draft',
    security: bearer,
    request: { params: idParam },
    responses: { 200: okResponse(postSchema), ...errors.unauthorized, ...errors.notFound },
  }),
  async (c) => ok(c, await postsService.unpublish(c.req.valid('param').id)),
)

router.openapi(
  createRoute({
    method: 'get',
    path: '/{id}/revisions',
    tags: [TAG],
    summary: 'List the revisions of a post, newest first',
    security: bearer,
    request: { params: idParam },
    responses: { 200: okResponse(z.array(revisionSchema)), ...errors.unauthorized, ...errors.notFound },
  }),
  async (c) => ok(c, await postsService.listRevisions(c.req.valid('param').id)),
)

router.openapi(
  createRoute({
    method: 'post',
    path: '/{id}/revisions/{revisionId}/restore',
    tags: [TAG],
    summary: 'Restore a revision onto the post (status unchanged)',
    security: bearer,
    request: { params: revisionParam },
    responses: {
      200: okResponse(postSchema),
      ...errors.unauthorized,
      ...errors.notFound,
      ...errors.conflict,
    },
  }),
  async (c) => {
    const { id, revisionId } = c.req.valid('param')
    return ok(c, await postsService.restoreRevision(id, revisionId))
  },
)

export { router as postsAdminRouter }
