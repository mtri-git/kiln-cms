import { createApp, type KilnOptions } from './app'
import { type RuntimeContext, runWithRequestContext } from './core/request-context'

export type KilnHandler = (request: Request, context: RuntimeContext) => Promise<Response>

/**
 * The app as one function, for any runtime. The adapters (`kiln-cms/cloudflare`, `kiln-cms/node`, `kiln-cms/bun`)
 * call it; use it directly only to run kiln-cms somewhere they do not cover, or in tests.
 */
export function createHandler(options: KilnOptions): KilnHandler {
  const app = createApp(options)
  return async (request, context) => {
    const origin = new URL(request.url).origin
    return runWithRequestContext({ ...context, origin }, () => app.fetch(request, context.env))
  }
}
