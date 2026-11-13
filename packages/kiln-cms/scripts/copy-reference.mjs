#!/usr/bin/env node
// Build step: copies the reference module (template/src/modules/categories, its table and its test) into
// reference/, so `kiln gen:module` works in any app, even one that deleted or changed its categories module.
// reference/ is generated: edit the template, not this folder.

import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const PACKAGE = join(dirname(fileURLToPath(import.meta.url)), '..')
const TEMPLATE = join(PACKAGE, '../../template')
const OUT = join(PACKAGE, 'reference')

const files = {
  'module/categories.schemas.ts': 'src/modules/categories/categories.schemas.ts',
  'module/categories.service.ts': 'src/modules/categories/categories.service.ts',
  'module/categories.home-routes.ts': 'src/modules/categories/categories.home-routes.ts',
  'module/categories.admin-routes.ts': 'src/modules/categories/categories.admin-routes.ts',
  'schema/categories.ts': 'src/db/schema/categories.ts',
  'test/categories.test.ts': 'test/categories.test.ts',
}

if (!existsSync(TEMPLATE)) {
  // Outside the repository (installed from npm) the published reference/ is used as it is.
  console.log('copy-reference: no template/ next to the package, keeping reference/ as it is')
  process.exit(0)
}
rmSync(OUT, { recursive: true, force: true })
for (const [to, from] of Object.entries(files)) {
  mkdirSync(dirname(join(OUT, to)), { recursive: true })
  cpSync(join(TEMPLATE, from), join(OUT, to))
}
console.log(`copy-reference: ${Object.keys(files).length} files copied to reference/`)
