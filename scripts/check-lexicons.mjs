// Checks every lexicon in lexicons/ is a valid Lexicon document, that the
// vendored community lexicons are pinned in lexicons.json with a publisher
// URI and CID, and that every pinned CID matches the file on disk.
import { readFile, readdir } from 'node:fs/promises'
import { join, relative } from 'node:path'
import { lexiconDocumentSchema } from '@atproto/lex-document'
import { cidForLex } from '@atproto/lex-cbor'

const root = new URL('..', import.meta.url).pathname
const config = JSON.parse(await readFile(join(root, 'iriai-proto.config.json'), 'utf8'))
const manifest = JSON.parse(await readFile(join(root, 'lexicons.json'), 'utf8'))
const strict = process.argv.includes('--require-pins')

async function* walk(dir) {
  for (const entry of await readdir(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name)
    if (entry.isDirectory()) yield* walk(path)
    else if (entry.name.endsWith('.json')) yield path
  }
}

const failures = []
const warnings = []
let count = 0
for await (const path of walk(join(root, 'lexicons'))) {
  count++
  const doc = JSON.parse(await readFile(path, 'utf8'))
  const result = lexiconDocumentSchema.safeParse(doc)
  if (!result.success) {
    failures.push(`${relative(root, path)}: not a valid Lexicon document: ${result.reason?.message ?? result.reason}`)
    continue
  }
  const expected = join(root, 'lexicons', ...doc.id.split('.')) + '.json'
  if (expected !== path) failures.push(`${relative(root, path)}: id ${doc.id} does not match its path`)
  if (doc.id.startsWith(config.namespace + '.')) continue

  const pin = manifest.resolutions?.[doc.id]
  if (!pin) {
    ;(strict ? failures : warnings).push(`${doc.id}: vendored but not yet pinned in lexicons.json (run the Sync lexicons workflow)`)
    continue
  }
  // A pin is the CID of the published com.atproto.lexicon.schema record, which
  // carries that $type; the file on disk may omit it.
  const record = { $type: 'com.atproto.lexicon.schema', ...doc }
  const cid = (await cidForLex(record)).toString()
  if (cid !== pin.cid) failures.push(`${doc.id}: file CID ${cid} does not match pinned ${pin.cid}`)
}

for (const w of warnings) console.warn(`! ${w}`)
if (failures.length) {
  for (const f of failures) console.error(`✗ ${f}`)
  process.exit(1)
}
console.log(`✓ ${count} lexicon documents valid${warnings.length ? ` (${warnings.length} not yet pinned)` : ', all vendored lexicons pinned'}`)
