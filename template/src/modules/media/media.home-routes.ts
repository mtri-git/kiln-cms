import { createRouter } from 'kiln-cms'
import { mediaService } from './media.service'

const router = createRouter()

// Plain handler instead of createRoute: it returns a binary stream, not the JSON envelope, and the key contains slashes.
router.get('/*', async (c) => {
  const key = c.req.path.replace(/^\/files\//, '')
  const object = await mediaService.getFile(key)
  return new Response(object.body, {
    headers: {
      'Content-Type': object.httpMetadata?.contentType ?? 'application/octet-stream',
      'Cache-Control': 'public, max-age=31536000, immutable',
      ETag: object.httpEtag,
    },
  })
})

export { router as mediaFilesRouter }
