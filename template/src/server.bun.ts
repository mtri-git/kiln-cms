import { serve } from 'kiln-cms/bun'
import { appOptions } from './app'

// Bun entry: a SQLite file for data, a folder for files. `pnpm dev:bun`, `pnpm start:bun`.
await serve(appOptions)
