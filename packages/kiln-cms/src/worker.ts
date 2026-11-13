import { drizzle } from 'drizzle-orm/d1'
import { createApp, type KilnOptions } from './app'
import { runWithRequestContext, type WorkerEnv } from './core/request-context'

/** The Worker entry. In the app: `export default createWorker({ registerRoutes, registerHooks })`. */
export function createWorker(options: KilnOptions) {
  const app = createApp(options)
  return {
    async fetch(request: Request, env: WorkerEnv, ctx: ExecutionContext): Promise<Response> {
      const db = drizzle(env.DB)
      const origin = new URL(request.url).origin
      const waitUntil = (promise: Promise<unknown>) => ctx.waitUntil(promise)
      return runWithRequestContext({ env, db, origin, waitUntil }, () => app.fetch(request, env, ctx))
    },
  }
}
