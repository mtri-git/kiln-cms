// kiln-cms/bun: run the app with Bun.serve, with a SQLite file (libSQL) for data and a folder for files.
import type { KilnOptions } from '../app'
import { clientIpOf, logStarted, prepareServer, type ServerConfig, stopOnSignals } from './sqlite'

export {
  createSqliteRuntime,
  fsStorage,
  type ServerConfig,
  type SqliteRuntime,
  type SqliteRuntimeConfig,
} from './sqlite'

/** The part of Bun's server API this adapter uses, so kiln-cms does not need `@types/bun`. */
type BunServer = {
  requestIP(request: Request): { address: string } | null
  stop(closeActiveConnections?: boolean): Promise<void> | void
}
type BunGlobal = {
  serve(options: {
    port: number
    hostname?: string
    fetch(request: Request, server: BunServer): Promise<Response>
  }): BunServer
}

/**
 * Starts the server. In the app: `await serve({ registerRoutes, registerHooks })`.
 * Applies the migrations first, then listens on `PORT` (default 8787). Bun reads `.env` itself.
 */
export async function serve(options: KilnOptions, config: ServerConfig = {}) {
  const bun = (globalThis as { Bun?: BunGlobal }).Bun
  if (!bun) throw new Error('kiln-cms/bun runs on Bun only. On Node.js, import serve from kiln-cms/node')

  const server = await prepareServer(options, config)
  const { runtime, env } = server
  const http = bun.serve({
    port: server.port,
    hostname: server.hostname,
    fetch: (request, bunServer) =>
      server.handle(request, {
        env,
        db: runtime.db,
        storage: runtime.storage,
        clientIp: clientIpOf(request, server.clientIpHeader, bunServer.requestIP(request)?.address),
        waitUntil: server.waitUntil,
      }),
  })
  logStarted('bun', server)
  stopOnSignals(server, () => http.stop())
  return http
}
