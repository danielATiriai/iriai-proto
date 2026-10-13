// Verifies the publication the way any consumer would resolve it: DNS
// authority (_lexicon TXT) -> publisher DID -> signed record from its PDS.
// Each published lexicon must resolve to our publisher, match the file in this
// release exactly, and carry the CID the publish step recorded. Then writes the
// release manifest (commit, records, pins, tool versions, approver).
import { fileURLToPath } from 'node:url'
import { readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { LexResolver } from '@atproto/lex-resolver'
import { lexEquals } from '@atproto/lex-data'
import { NSID } from '@atproto/syntax'

const root = fileURLToPath(new URL('..', import.meta.url))
const read = async (p) => JSON.parse(await readFile(join(root, p), 'utf8'))
const config = await read('iriai-proto.config.json')
const pkg = await read('package.json')
const lock = await read('package-lock.json')
const publication = await read('release/publication.json')
const bundle = await read('release/bundle.json')
const pins = await read('lexicons.json')

// The approver of the protected release environment, read by the workflow from
// the run's approvals API (GITHUB_ACTOR is only whoever pushed the tag).
const approvedBy = JSON.parse(process.env.RELEASE_APPROVED_BY || '[]')
if (process.env.GITHUB_ACTIONS && approvedBy.length === 0) {
  console.error('✗ no approval recorded for the release environment; add a required reviewer to "release"')
  process.exit(1)
}

const resolver = new LexResolver({})
const failures = []
for (const record of publication.records) {
  const nsid = NSID.from(record.nsid)
  try {
    const did = await resolver.resolve(nsid)
    if (did !== config.publisher.did) failures.push(`${record.nsid}: authority resolves to ${did}, expected ${config.publisher.did}`)
    const fetched = await resolver.fetch(did, nsid, { noCache: true })
    const local = await read(join('lexicons', ...record.nsid.split('.')) + '.json')
    if (fetched.cid.toString() !== record.cid) failures.push(`${record.nsid}: network CID ${fetched.cid} != published ${record.cid}`)
    const { $type: _type, ...published } = fetched.lexicon
    if (!lexEquals(published, local)) failures.push(`${record.nsid}: published document differs from the release file`)
    console.log(`✓ ${record.nsid} resolves via ${config.publisher.authorityRecord} to ${did}, CID ${fetched.cid}`)
  } catch (err) {
    failures.push(`${record.nsid}: ${err.message}${err.cause ? ` (${err.cause.message ?? err.cause})` : ''}`)
  }
}
if (failures.length) {
  for (const f of failures) console.error(`✗ ${f}`)
  console.error('Publication is partial or unverified; the release stays unreleased in the catalog.')
  process.exit(1)
}

const version = (name) => lock.packages?.[`node_modules/${name}`]?.version ?? null
const manifest = {
  version: pkg.version,
  tag: `v${pkg.version}`,
  namespace: config.namespace,
  sourceCommit: process.env.GITHUB_SHA ?? null,
  bundle,
  publisher: { did: config.publisher.did, handle: config.publisher.handle, authorityRecord: config.publisher.authorityRecord },
  records: publication.records,
  vendoredLexicons: pins.resolutions,
  testedTools: {
    node: process.version,
    '@atproto/lex': version('@atproto/lex'),
    '@atproto/lexicon': version('@atproto/lexicon'),
    '@atproto/lex-resolver': version('@atproto/lex-resolver'),
    typescript: version('typescript'),
    'h3-js': version('h3-js'),
  },
  approval: {
    environment: 'release',
    approvedBy,
    triggeredBy: process.env.GITHUB_ACTOR ?? null,
    run: process.env.GITHUB_RUN_ID
      ? `${process.env.GITHUB_SERVER_URL}/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}`
      : null,
  },
  verifiedAt: new Date().toISOString(),
}
await writeFile(join(root, 'release/release-manifest.json'), JSON.stringify(manifest, null, 2) + '\n')
console.log('✓ release manifest written')
