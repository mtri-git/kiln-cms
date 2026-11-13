import type { KilnOptions } from 'kiln-cms'
import { registerHooks } from './hooks'
import { registerRoutes } from './routes'

// The app, the same on every runtime. Routes go in routes.ts, change hooks in hooks.ts.
// The entries below only pick the runtime: worker.ts (Cloudflare), server.ts (Node.js), server.bun.ts (Bun).
export const appOptions: KilnOptions = { title: 'Kiln CMS API', version: '0.1.0', registerRoutes, registerHooks }
