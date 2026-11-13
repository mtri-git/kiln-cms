#!/usr/bin/env node
// Checks the rules in AGENTS.md that the compiler cannot see.
// Prints one line per violation as `path: message` and exits 1; exits 0 with an OK line otherwise.

import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'

// The app is the current directory: these scripts run as `kiln <command>` from the app root.
const ROOT = process.cwd()
const SRC = join(ROOT, 'src')
const MODULES = join(SRC, 'modules')
const SCHEMA_DIR = join(SRC, 'db/schema')
const SCHEMA_INDEX = join(SCHEMA_DIR, 'index.ts')
const ROUTES = join(SRC, 'routes.ts')
const SCHEMA_NOT_TABLES = new Set(['index.ts'])

const violations = []
let filesChecked = 0

const rel = (file) => relative(ROOT, file).split(sep).join('/')
const report = (file, message) => violations.push(`${rel(file)}: ${message}`)
const isComment = (line) => {
  const t = line.trim()
  return t.startsWith('//') || t.startsWith('*') || t.startsWith('/*')
}
const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

function walk(dir, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) walk(path, out)
    else out.push(path)
  }
  return out
}

const sourceFiles = walk(SRC).filter((f) => /\.tsx?$/.test(f))
const read = (file) => readFileSync(file, 'utf8')
const lines = (file) => read(file).split(/\r?\n/)
filesChecked = sourceFiles.length

// ---- 1. Module folders contain only the four allowed files ----------------

const moduleFolders = readdirSync(MODULES, { withFileTypes: true })
for (const entry of moduleFolders) {
  const path = join(MODULES, entry.name)
  if (!entry.isDirectory()) {
    report(path, 'only folders are allowed directly in src/modules')
    continue
  }
  const mod = entry.name
  const isAuth = mod === 'auth'
  const entries = readdirSync(path, { withFileTypes: true })
  const names = new Set(entries.map((e) => e.name))
  const allowed = isAuth
    ? [`${mod}.schemas.ts`, `${mod}.service.ts`, `${mod}.routes.ts`]
    : [`${mod}.schemas.ts`, `${mod}.service.ts`, `${mod}.home-routes.ts`, `${mod}.admin-routes.ts`]

  for (const e of entries) {
    const file = join(path, e.name)
    if (e.isDirectory()) report(file, 'subfolders are not allowed in a module')
    else if (!allowed.includes(e.name)) report(file, `file not allowed in a module (expected: ${allowed.join(', ')})`)
  }
  for (const required of [`${mod}.schemas.ts`, `${mod}.service.ts`]) {
    if (!names.has(required)) report(path, `missing required file ${required}`)
  }
  const routeFiles = isAuth ? [`${mod}.routes.ts`] : [`${mod}.home-routes.ts`, `${mod}.admin-routes.ts`]
  if (!routeFiles.some((f) => names.has(f))) report(path, `no routes file (need one of: ${routeFiles.join(', ')})`)
}

// ---- 2-5. Per-file rules over everything under src/ ----------------------

for (const file of sourceFiles) {
  const text = read(file)
  const src = lines(file)
  const name = file.split(sep).pop()

  if (text.includes('new OpenAPIHono(')) {
    report(file, 'uses new OpenAPIHono(); use createRouter() from kiln-cms')
  }

  src.forEach((line, i) => {
    if (isComment(line)) return
    if (/\bas\s+any\b|:\s*any\b/.test(line)) {
      report(file, `line ${i + 1}: uses any (no any or as any allowed)`)
    }
  })

  if (name.endsWith('.admin-routes.ts') && !/router\.use\(\s*'\*'\s*,\s*requireAuth\s*\)/.test(text)) {
    report(file, "admin routes must start with router.use('*', requireAuth)")
  }

  if (name.endsWith('.home-routes.ts') && /import\s*(type\s*)?\{[^}]*\brequireAuth\b[^}]*\}\s*from/.test(text)) {
    report(file, 'home routes must not import requireAuth')
  }
}

// ---- 6. Every schema table file is exported from db/schema/index.ts -------

if (existsSync(SCHEMA_DIR)) {
  const indexText = existsSync(SCHEMA_INDEX) ? read(SCHEMA_INDEX) : ''
  for (const entry of readdirSync(SCHEMA_DIR, { withFileTypes: true })) {
    if (entry.isDirectory() || !entry.name.endsWith('.ts') || SCHEMA_NOT_TABLES.has(entry.name)) continue
    const base = entry.name.replace(/\.ts$/, '')
    if (!new RegExp(`from\\s+['"]\\./${escapeRegex(base)}['"]`).test(indexText)) {
      report(join(SCHEMA_DIR, entry.name), 'not exported from src/db/schema/index.ts')
    }
  }
}

// ---- 7. Every routes file's router is registered in src/routes.ts ----------

const routesText = existsSync(ROUTES) ? read(ROUTES) : ''
for (const file of sourceFiles) {
  if (!file.startsWith(MODULES + sep)) continue
  const name = file.split(sep).pop()
  if (!/\.(home-routes|admin-routes|routes)\.ts$/.test(name)) continue
  const text = read(file)
  const exported =
    text.match(/export\s*\{\s*\w+\s+as\s+(\w+)\s*\}/)?.[1] ??
    text.match(/export\s+const\s+(\w+)\s*=\s*createRouter\(/)?.[1]
  if (!exported) {
    report(file, 'no exported router found')
  } else if (!new RegExp(`\\b${escapeRegex(exported)}\\b`).test(routesText)) {
    report(file, `router ${exported} is not registered in src/routes.ts`)
  }
}

// ---- 8. Modules import from other modules only through .service / .schemas -

for (const file of sourceFiles) {
  if (!file.startsWith(MODULES + sep)) continue
  const ownModule = relative(MODULES, file).split(sep)[0]
  const text = read(file)
  for (const match of text.matchAll(/(?:from\s+|import\s*\(\s*)['"](\.[^'"]*)['"]/g)) {
    const target = resolve(dirname(file), match[1])
    const parts = relative(MODULES, target).split(sep)
    if (parts[0].startsWith('..') || parts.length < 2) continue
    const [targetModule, fileBase] = [parts[0], parts[parts.length - 1]]
    if (targetModule === ownModule) continue
    if (!/\.(service|schemas)$/.test(fileBase)) {
      report(file, `imports ${match[1]} from another module; only .service or .schemas files are allowed`)
    }
  }
}

// ---- Result ---------------------------------------------------------------

if (violations.length > 0) {
  console.log(violations.join('\n'))
  console.log(`\n${violations.length} convention violation(s) in ${filesChecked} source file(s).`)
  process.exit(1)
}
console.log(`OK: conventions hold (${filesChecked} source files checked).`)
process.exit(0)
