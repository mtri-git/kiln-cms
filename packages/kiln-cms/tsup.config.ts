import { defineConfig } from 'tsup'

export default defineConfig({
  // `schema` is a separate entry so drizzle-kit can load the tables without loading Hono.
  entry: { index: 'src/index.ts', schema: 'src/db/schema/index.ts' },
  format: ['esm'],
  platform: 'node',
  target: 'es2022',
  dts: true,
  splitting: true,
  clean: true,
})
