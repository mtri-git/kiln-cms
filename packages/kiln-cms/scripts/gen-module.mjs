#!/usr/bin/env node
// Creates a new module from the `categories` reference module.
// Usage: pnpm gen:module <plural-kebab-name> [singular-kebab-name]
//   pnpm gen:module authors
//   pnpm gen:module post-series post-series

import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

// The app is the current directory: these scripts run as `kiln <command>` from the app root.
const ROOT = process.cwd()
const REF = 'categories'
const REF_SINGULAR = 'category'
const KEBAB = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/

const TEMPLATE_DIR = join(ROOT, 'src/modules', REF)
const TEMPLATE_SCHEMA = join(ROOT, 'src/db/schema', `${REF}.ts`)
const SCHEMA_INDEX = join(ROOT, 'src/db/schema/index.ts')
const ROUTES = join(ROOT, 'src/routes.ts')

function die(message) {
  console.error(`gen:module failed: ${message}`)
  process.exit(1)
}

function deriveSingular(plural) {
  if (plural.endsWith('ies')) return `${plural.slice(0, -3)}y`
  if (plural.endsWith('s')) return plural.slice(0, -1)
  return plural
}

const cap = (word) => word[0].toUpperCase() + word.slice(1)
const escapeRegex = (text) => text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/** All the spellings of one name: the kebab form is the input, the rest are derived. */
function forms(kebab) {
  const words = kebab.split('-')
  return {
    kebab,
    camel: words[0] + words.slice(1).map(cap).join(''),
    pascal: words.map(cap).join(''),
    snake: words.join('_'),
    title: words.map(cap).join(' '),
    lower: words.join(' '),
  }
}

const [, , pluralArg, singularArg] = process.argv
if (!pluralArg) die('usage: pnpm gen:module <plural-kebab-name> [singular-kebab-name]')
if (!KEBAB.test(pluralArg)) die(`"${pluralArg}" is not lowercase kebab-case (example: post-series)`)
const singularName = singularArg ?? deriveSingular(pluralArg)
if (!KEBAB.test(singularName)) die(`singular "${singularName}" is not lowercase kebab-case`)

const P = forms(pluralArg)
const S = forms(singularName)

const moduleDir = join(ROOT, 'src/modules', pluralArg)
const schemaFile = join(ROOT, 'src/db/schema', `${pluralArg}.ts`)
if (existsSync(moduleDir)) die(`${moduleDir} already exists`)
if (existsSync(schemaFile)) die(`${schemaFile} already exists`)
if (!existsSync(TEMPLATE_DIR) || !existsSync(TEMPLATE_SCHEMA)) die('reference templates are missing')

/** Identifiers in code: camelCase, PascalCase. Longer variants first. */
function replaceIdentifiers(code) {
  return code
    .replaceAll('Categories', P.pascal)
    .replaceAll('Category', S.pascal)
    .replaceAll('categories', P.camel)
    .replaceAll('category', S.camel)
}

/** Prose inside strings with spaces and comments: "List categories" -> "List authors". */
function replaceProse(text) {
  let out = text
    .replaceAll('Categories', P.title)
    .replaceAll('Category', S.title)
    .replaceAll('categories', P.lower)
    .replaceAll('category', S.lower)
  if (/^[aeiou]/i.test(S.lower)) {
    // "a category" -> "an author" when the new singular starts with a vowel.
    const next = `(?=${escapeRegex(S.lower)}\\b|${escapeRegex(S.title)}\\b)`
    out = out.replace(new RegExp(`\\b([Aa]) ${next}`, 'g'), (_, a) => `${a}n `)
  }
  return out
}

/** Comments and quoted strings are matched first so each gets its own rule. */
const TOKEN = /\/\*\*[\s\S]*?\*\/|\/\/[^\n]*|'[^'\n]*'/g

function replaceToken(token, offset, source) {
  if (token.startsWith('/')) return replaceProse(token)
  const inner = token.slice(1, -1)
  if (inner === REF) return `'${P.snake}'` // SQL table name
  if (inner === REF_SINGULAR) return `'${S.snake}'`
  if (inner.startsWith('.') || inner.startsWith('/')) {
    // import paths and route paths: kebab-case
    return `'${inner.replaceAll(REF, P.kebab).replaceAll(REF_SINGULAR, S.kebab)}'`
  }
  if (inner.includes('_')) {
    // SQL names such as idx_categories_order_name
    return `'${inner.replaceAll(REF, P.snake).replaceAll(REF_SINGULAR, S.snake)}'`
  }
  if (inner.includes(' ')) return `'${replaceProse(inner)}'`
  if (source.slice(Math.max(0, offset - 'NOT_FOUND('.length), offset) === 'NOT_FOUND(') {
    return `'${replaceProse(inner)}'` // Errors.NOT_FOUND('Category') -> 'Author'
  }
  return `'${replaceIdentifiers(inner)}'`
}

function transform(source) {
  let out = ''
  let last = 0
  for (const match of source.matchAll(TOKEN)) {
    out += replaceIdentifiers(source.slice(last, match.index))
    out += replaceToken(match[0], match.index, source)
    last = match.index + match[0].length
  }
  return out + replaceIdentifiers(source.slice(last))
}

// ---- 1. Build every new file in memory, so a failure writes nothing ------

const outputs = new Map() // absolute path -> content
for (const name of readdirSync(TEMPLATE_DIR)) {
  const target = join(moduleDir, name.replaceAll(REF, P.kebab))
  outputs.set(target, transform(readFileSync(join(TEMPLATE_DIR, name), 'utf8')))
}
outputs.set(schemaFile, transform(readFileSync(TEMPLATE_SCHEMA, 'utf8')))

for (const [file, content] of outputs) {
  const leftover = content.match(/.*categor.*/i)
  if (leftover) die(`leftover reference text in ${file}: ${leftover[0].trim()}`)
}

// ---- 2. Insert lines into the shared files, keeping them sorted -----------

/**
 * Inserts `line` before the first line whose sort key is greater than `key`,
 * or after the last matching line. Lines are matched by `pattern`.
 */
function insertSorted(lines, pattern, key, newKey, line) {
  if (lines.some((l) => l === line)) die(`line already present: ${line}`)
  const matches = lines.map((l, i) => ({ i, m: l.match(pattern) })).filter((x) => x.m)
  if (matches.length === 0) die(`no anchor lines found for ${newKey}`)
  const before = matches.find((x) => key(x.m) > newKey)
  if (before) lines.splice(before.i, 0, line)
  else lines.splice(matches[matches.length - 1].i + 1, 0, line)
}

/** The repo uses CRLF; read and write the shared files with the eol they already have. */
function readLines(file) {
  const text = readFileSync(file, 'utf8')
  const eol = text.includes('\r\n') ? '\r\n' : '\n'
  return { eol, lines: text.split(eol) }
}

const index = readLines(SCHEMA_INDEX)
const indexLines = index.lines
insertSorted(indexLines, /^export \* from '\.\/([^']+)'/, (m) => m[1], P.kebab, `export * from './${P.kebab}'`)

const routes = readLines(ROUTES)
const routeLines = routes.lines
const moduleImport = /^import \{ \w+ \} from '\.\/modules\/([a-z0-9-]+)\//
const moduleKey = (m) => m[1]
const adminImport = `import { ${P.camel}AdminRouter } from './modules/${P.kebab}/${P.kebab}.admin-routes'`
const homeImport = `import { ${P.camel}HomeRouter } from './modules/${P.kebab}/${P.kebab}.home-routes'`
insertSorted(routeLines, moduleImport, moduleKey, P.kebab, adminImport)
// Keep the home import right after the admin import (the reference module lists admin first).
routeLines.splice(routeLines.indexOf(adminImport) + 1, 0, homeImport)

const apiRoute = `  api.route('/${P.kebab}', ${P.camel}HomeRouter)`
const adminRoute = `  admin.route('/${P.kebab}', ${P.camel}AdminRouter)`
insertSorted(routeLines, /^\s*api\.route\('\/([^']+)'/, (m) => m[1], P.kebab, apiRoute)
insertSorted(routeLines, /^\s*admin\.route\('\/([^']+)'/, (m) => m[1], P.kebab, adminRoute)
// ---- 3. Write ---------------------------------------------------------------

mkdirSync(moduleDir, { recursive: true })
for (const [file, content] of outputs) writeFileSync(file, content)
writeFileSync(SCHEMA_INDEX, indexLines.join(index.eol))
writeFileSync(ROUTES, routeLines.join(routes.eol))

const created = [...outputs.keys()].map((f) => `  ${f.slice(ROOT.length + 1).replaceAll('\\', '/')}`)
console.log(`Created module "${P.kebab}" (singular "${S.kebab}"):`)
console.log(created.join('\n'))
console.log('Updated:')
console.log('  src/db/schema/index.ts')
console.log('  src/routes.ts')
console.log(`
Next steps:
  1. Edit the columns in src/db/schema/${P.kebab}.ts, then the matching Zod schemas in
     src/modules/${P.kebab}/${P.kebab}.schemas.ts (and the service if it needs new rules).
  2. pnpm db:generate
  3. pnpm db:migrate:local
  4. pnpm check
`)
