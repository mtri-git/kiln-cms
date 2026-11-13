import { createRouter } from 'kiln-cms'
import { mediaService } from './media.service'

const router = createRouter()

// Plain handler instead of createRoute: it returns a binary stream, not the JSON envelope, and the key contains slashes.
router.get('/*', async (c) => {
  const key = c.req.path.replace(/^\/files\//, '')
  const file = await mediaService.getFile(key)
  return new Response(file.body, {
    headers: {
      'Content-Type': file.contentType,
      'Content-Length': String(file.size),
      'Cache-Control': 'public, max-age=31536000, immutable',
      ETag: file.etag,
      // Files come from users: never let the browser guess the type or run scripts in them (an SVG with <script>).
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox",
    },
  })
})

export { router as mediaFilesRouter }
