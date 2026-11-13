import { createRoute } from '@hono/zod-openapi'
import { createRouter, errors, ok, okResponse, pageResponse, paginated, slugParam } from 'kiln-cms'
import { listTagsQuery, tagSchema } from './tags.schemas'
import { tagsService } from './tags.service'

const TAG = 'Tags - Public'
const router = createRouter()

router.openapi(
  createRoute({
    method: 'get',
    path: '/',
    tags: [TAG],
    summary: 'List tags',
    request: { query: listTagsQuery },
    responses: { 200: pageResponse(tagSchema), ...errors.validation },
  }),
  async (c) => {
    const { rows, total, params } = await tagsService.list(c.req.valid('query'))
    return paginated(c, rows, total, params)
  },
)

router.openapi(
  createRoute({
    method: 'get',
    path: '/{slug}',
    tags: [TAG],
    summary: 'Get a tag by slug',
    request: { params: slugParam },
    responses: { 200: okResponse(tagSchema), ...errors.notFound },
  }),
  async (c) => ok(c, await tagsService.getBySlug(c.req.valid('param').slug)),
)

export { router as tagsHomeRouter }
