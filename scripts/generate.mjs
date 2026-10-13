// Generates the IriaiProto lexicons in lexicons/ from authoring/.
//
// - Reads the namespace from iriai-proto.config.json (D-30): "{ns}" in an
//   authoring file becomes that namespace.
// - Inlines the single Location union from authoring/location.json wherever an
//   authoring file has {"$location": "<description>"}.
//
// With --check it writes nothing and fails if the committed lexicons differ
// from what would be generated, or if any Location union in them differs from
// the authoring definition.
import { fileURLToPath } from 'node:url'
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { isDeepStrictEqual } from 'node:util'

const root = fileURLToPath(new URL('..', import.meta.url))
const check = process.argv.includes('--check')

const config = JSON.parse(await readFile(join(root, 'iriai-proto.config.json'), 'utf8'))
const { $comment: _, ...locationUnion } = JSON.parse(
  await readFile(join(root, 'authoring/location.json'), 'utf8'),
)

function expand(value) {
  if (typeof value === 'string') return value.replaceAll('{ns}', config.namespace)
  if (Array.isArray(value)) return value.map(expand)
  if (value && typeof value === 'object') {
    if ('$location' in value) {
      return { ...structuredClone(locationUnion), description: value.$location }
    }
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, expand(v)]))
  }
  return value
}

function lexiconPath(id) {
  return join(root, 'lexicons', ...id.split('.')) + '.json'
}

const failures = []
const authoringFiles = (await readdir(join(root, 'authoring'))).filter(
  (f) => f.endsWith('.json') && f !== 'location.json',
)

for (const file of authoringFiles.sort()) {
  const doc = expand(JSON.parse(await readFile(join(root, 'authoring', file), 'utf8')))
  const path = lexiconPath(doc.id)
  const text = JSON.stringify(doc, null, 2) + '\n'
  if (check) {
    const committed = await readFile(path, 'utf8').catch(() => null)
    if (committed !== text) failures.push(`${doc.id}: lexicons/ is out of date, run npm run generate`)
    for (const union of findLocationUnions(JSON.parse(committed ?? '{}'))) {
      const { description: _d, ...shape } = union
      if (!isDeepStrictEqual(shape, locationUnion)) {
        failures.push(`${doc.id}: a Location union differs from authoring/location.json`)
      }
    }
  } else {
    await mkdir(dirname(path), { recursive: true })
    await writeFile(path, text)
    console.log(`wrote ${doc.id}`)
  }
}

function* findLocationUnions(value) {
  if (Array.isArray(value)) {
    for (const v of value) yield* findLocationUnions(v)
  } else if (value && typeof value === 'object') {
    if (value.type === 'union' && value.refs?.includes('community.lexicon.location.geo')) yield value
    for (const v of Object.values(value)) yield* findLocationUnions(v)
  }
}

if (failures.length) {
  for (const f of failures) console.error(`✗ ${f}`)
  process.exit(1)
}
if (check) console.log(`✓ ${authoringFiles.length} generated lexicons match authoring/ and share one Location union`)
