import { serve } from 'kiln-cms/node'
import { appOptions } from './app'

// Node.js entry: a SQLite file for data, a folder for files. `pnpm dev:node`, `pnpm start:node`.
await serve(appOptions)
