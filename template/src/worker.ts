import { createWorker } from 'kiln-cms'
import { registerHooks } from './hooks'
import { registerRoutes } from './routes'

// The Worker entry. Routes go in routes.ts, change hooks in hooks.ts.
export default createWorker({ title: 'Kiln CMS API', version: '0.1.0', registerRoutes, registerHooks })
