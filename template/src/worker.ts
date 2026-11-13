import { createWorker } from 'kiln-cms/cloudflare'
import { appOptions } from './app'

// Cloudflare Workers entry: D1 for data, R2 for files. `pnpm dev`, `pnpm run deploy`.
export default createWorker(appOptions)
