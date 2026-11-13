import { defineConfig } from 'vitest/config'

// Every test runs on both adapters: Cloudflare (D1 + R2) and Node/Bun (libSQL + a folder). See test/helpers.ts.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['test/**/*.test.ts'],
    globalSetup: ['test/global-setup.ts'],
    testTimeout: 20_000,
    hookTimeout: 60_000,
    projects: ['cloudflare', 'node'].map((runtime) => ({
      extends: true,
      test: { name: runtime, env: { KILN_TEST_RUNTIME: runtime } },
    })),
  },
})
