// kiln-cms/node: run the app as a Node.js server, with a SQLite file (libSQL) for data and a folder for files.
import { serve as serveHttp } from '@hono/node-server'
import type { KilnOptions } from '../app'
import { clientIpOf, logStarted, prepareServer, type ServerConfig, stopOnSignals } from './sqlite'

export {
  createSqliteRuntime,
  fsStorage,
  type ServerConfig,
  type SqliteRuntime,
  type SqliteRuntimeConfig,
} from './sqlite'

/**
 * Starts the server. In the app: `await serve({ registerRoutes, registerHooks })`.
 * Applies the migrations first, then listens on `PORT` (default 8787). Reads `.env` when it exists.
 */
export async function serve(options: KilnOptions, config: ServerConfig = {}) {
  const server = await prepareServer(options, config)
  const { runtime, env } = server
  const http = serveHttp({
    port: server.port,
    hostname: server.hostname,
    fetch: (request: Request, bindings: { incoming?: { socket?: { remoteAddress?: string } } }) =>
      server.handle(request, {
        env,
        db: runtime.db,
        storage: runtime.storage,
        clientIp: clientIpOf(request, server.clientIpHeader, bindings.incoming?.socket?.remoteAddress),
        waitUntil: server.waitUntil,
      }),
  })
  logStarted('node', server)
  stopOnSignals(server, () => new Promise<void>((done) => http.close(() => done())))
  return http
}
