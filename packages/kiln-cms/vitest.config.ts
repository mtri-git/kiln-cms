import { defineConfig } from 'vitest/config'

// `reference/` holds the files `kiln gen:module` copies into an app, including tests that need that app's
// helpers: they are not tests of this package.
export default defineConfig({
  esbuild: { jsx: 'automatic' },
  test: { include: ['test/**/*.test.{ts,tsx}'] },
})
