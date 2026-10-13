// Lexicon evolution check (PlaceProto spec section 6): under an existing NSID
// only compatible changes are allowed. Compares our lexicons with the last
// released tag (or --base <ref>) and fails on a removed lexicon or def, a
// changed type, format, ref or record key, a removed property or union member,
// or a newly required property. Breaking changes need a new NSID instead.
import { execFileSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = fileURLToPath(new URL('..', import.meta.url))
const git = (...args) => execFileSync('git', args, { cwd: root, encoding: 'utf8' }).trim()
const config = JSON.parse(await readFile(join(root, 'iriai-proto.config.json'), 'utf8'))

const baseArg = process.argv.indexOf('--base')
let base = baseArg > -1 ? process.argv[baseArg + 1] : undefined
if (!base) {
  const own = new Set(git('tag', '--points-at', 'HEAD').split('\n').filter(Boolean))
  base = git('tag', '--list', 'v*', '--sort=-v:refname').split('\n').find((t) => t && !own.has(t))
}
if (!base) {
  console.log('✓ no earlier release to compare against')
  process.exit(0)
}

const dir = `lexicons/${config.namespace.split('.').join('/')}`
const oldFiles = git('ls-tree', '-r', '--name-only', base, '--', dir).split('\n').filter((f) => f.endsWith('.json'))
if (oldFiles.length === 0) {
  console.log(`✓ ${base} has no lexicons under ${config.namespace}; a namespace move is a new NSID by design`)
  process.exit(0)
}

const breaks = []
for (const file of oldFiles) {
  const before = JSON.parse(git('show', `${base}:${file}`))
  const after = await readFile(join(root, file), 'utf8').then(JSON.parse, () => null)
  if (!after) {
    breaks.push(`${before.id}: lexicon removed`)
    continue
  }
  for (const [name, def] of Object.entries(before.defs)) {
    compare(`${before.id}#${name}`, def, after.defs[name])
  }
}

function compare(path, a, b) {
  if (!b) return breaks.push(`${path}: removed`)
  if (a.type !== b.type) return breaks.push(`${path}: type ${a.type} -> ${b.type}`)
  for (const key of ['format', 'ref', 'key', 'const']) {
    if (a[key] !== b[key]) breaks.push(`${path}: ${key} ${a[key]} -> ${b[key]}`)
  }
  if (a.type === 'union') {
    for (const ref of a.refs ?? []) if (!b.refs?.includes(ref)) breaks.push(`${path}: union member ${ref} removed`)
    if (!a.closed && b.closed) breaks.push(`${path}: open union closed`)
  }
  if (a.type === 'record') compare(`${path}.record`, a.record, b.record)
  if (a.type === 'array') compare(`${path}[]`, a.items, b.items)
  if (a.type === 'object' || a.type === 'params') {
    for (const [prop, schema] of Object.entries(a.properties ?? {})) compare(`${path}.${prop}`, schema, b.properties?.[prop])
    for (const req of b.required ?? []) {
      if (!(a.required ?? []).includes(req)) breaks.push(`${path}: ${req} newly required`)
    }
  }
}

if (breaks.length) {
  for (const b of breaks) console.error(`✗ ${b}`)
  console.error(`Breaking changes against ${base}; use a new NSID with migration guidance.`)
  process.exit(1)
}
console.log(`✓ ${oldFiles.length} lexicons evolve compatibly from ${base}`)
