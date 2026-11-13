#!/usr/bin/env node
// kiln <command>: runs one of the scripts against the app in the current directory.

const commands = {
  'gen:module': '../scripts/gen-module.mjs',
  check: '../scripts/check-conventions.mjs',
}

const [, , command, ...rest] = process.argv
if (!command || !(command in commands)) {
  console.error(
    [
      'Usage: kiln <command>',
      '  kiln gen:module <plural-name> [singular-name] [--dry-run]   create a module and its test',
      '  kiln check                                                  check the conventions in AGENTS.md',
    ].join('\n'),
  )
  process.exit(1)
}

// The scripts read their arguments from process.argv[2...], as if they were run directly.
process.argv = [process.argv[0], command, ...rest]
await import(commands[command])
