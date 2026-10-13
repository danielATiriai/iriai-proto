// Builds the checksummed release bundle (PlaceProto spec section 6): lexicon
// JSON, the dependency CID manifest, generated TypeScript, fixtures, the
// named-place list, configuration and changelog. Refuses to bundle a release
// that is not fully pinned or that ships unverified place coordinates.
import { fileURLToPath } from 'node:url'
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'

const root = fileURLToPath(new URL('..', import.meta.url))
const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'))
const places = JSON.parse(await readFile(join(root, 'places/japantown.json'), 'utf8'))
const tag = `v${pkg.version}`

const failures = []
if (process.env.GITHUB_REF_TYPE === 'tag' && process.env.GITHUB_REF_NAME !== tag) {
  failures.push(`tag ${process.env.GITHUB_REF_NAME} does not match package.json version ${pkg.version}`)
}
for (const place of places.places) {
  if (!place.coordinatesVerified) failures.push(`named place ${place.id} has unverified coordinates`)
}
const changelog = await readFile(join(root, 'CHANGELOG.md'), 'utf8')
if (!changelog.includes(`## ${pkg.version}`)) failures.push(`CHANGELOG.md has no "## ${pkg.version}" section`)
if (failures.length) {
  for (const f of failures) console.error(`✗ ${f}`)
  process.exit(1)
}

const out = join(root, 'release')
await mkdir(out, { recursive: true })
const name = `iriai-proto-${pkg.version}.tar.gz`
execFileSync(
  'tar',
  [
    '--sort=name', '--owner=0', '--group=0', '--numeric-owner', '--mtime=@0',
    '-czf', join(out, name),
    'lexicons', 'lexicons.json', 'src/lexicons', 'fixtures', 'places',
    'iriai-proto.config.json', 'CHANGELOG.md', 'README.md',
  ],
  { cwd: root, env: { ...process.env, GZIP: '-n' } },
)
const sha256 = createHash('sha256').update(await readFile(join(out, name))).digest('hex')
await writeFile(join(out, 'SHA256SUMS'), `${sha256}  ${name}\n`)
await writeFile(join(out, 'bundle.json'), JSON.stringify({ version: pkg.version, tag, file: name, sha256 }, null, 2) + '\n')
console.log(`✓ ${name} ${sha256}`)
