import { defineConfig } from 'tsdown'

export default defineConfig({
  // `schema` is a separate entry so drizzle-kit can load the tables without loading Hono.
  // One entry per adapter, so a Worker never loads libSQL and a Node server never loads the D1 driver.
  entry: {
    index: 'src/index.ts',
    schema: 'src/db/schema/index.ts',
    cloudflare: 'src/adapters/cloudflare.ts',
    node: 'src/adapters/node.ts',
    bun: 'src/adapters/bun.ts',
  },
  format: 'esm',
  platform: 'node',
  target: 'es2022',
  dts: true,
  clean: true,
  // Same file names as before (.js, .d.ts): the package is "type": "module", so .js is ESM.
  fixedExtension: false,
})
