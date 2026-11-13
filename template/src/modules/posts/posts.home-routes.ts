import { createRoute } from '@hono/zod-openapi'
import { createRouter, errors, ok, okResponse, pageResponse, paginated, slugParam } from 'kiln-cms'
import { listPublicPostsQuery, postListItemSchema, postSchema } from './posts.schemas'
import { postsService } from './posts.service'

const TAG = 'Posts - Public'
const router = createRouter()

router.openapi(
  createRoute({
    method: 'get',
    path: '/',
    tags: [TAG],
    summary: 'List published posts',
    request: { query: listPublicPostsQuery },
    responses: { 200: pageResponse(postListItemSchema), ...errors.validation },
  }),
  async (c) => {
    const { rows, total, params } = await postsService.listPublished(c.req.valid('query'))
    return paginated(c, rows, total, params)
  },
)

router.openapi(
  createRoute({
    method: 'get',
    path: '/{slug}',
    tags: [TAG],
    summary: 'Get a published post by slug',
    request: { params: slugParam },
    responses: { 200: okResponse(postSchema), ...errors.notFound },
  }),
  async (c) => ok(c, await postsService.getPublishedBySlug(c.req.valid('param').slug)),
)

export { router as postsHomeRouter }
