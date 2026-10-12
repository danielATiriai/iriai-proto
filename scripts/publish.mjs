// Publishes this release's own lexicons as com.atproto.lexicon.schema records
// (rkey = NSID) from the publisher account. Needs PUBLISHER_APP_PASSWORD, the
// iriai-proto-release app password, which only the release job receives.
// Vendored community lexicons are never republished under our account.
import { readFile, readdir, writeFile, mkdir } from 'node:fs/promises'
import { join } from 'node:path'

const root = new URL('..', import.meta.url).pathname
const config = JSON.parse(await readFile(join(root, 'iriai-proto.config.json'), 'utf8'))
const password = process.env.PUBLISHER_APP_PASSWORD
const entryway = process.env.PUBLISHER_SERVICE ?? 'https://bsky.social'
if (!password) {
  console.error('✗ PUBLISHER_APP_PASSWORD is not set')
  process.exit(1)
}

async function xrpc(service, method, body, token) {
  const res = await fetch(`${service}/xrpc/${method}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(`${method} failed (${res.status}): ${json.error ?? ''} ${json.message ?? ''}`)
  return json
}

const session = await xrpc(entryway, 'com.atproto.server.createSession', {
  identifier: config.publisher.handle,
  password,
})
if (session.did !== config.publisher.did) {
  console.error(`✗ signed in as ${session.did}, expected publisher ${config.publisher.did}`)
  process.exit(1)
}
const pds = session.didDoc?.service?.find((s) => s.id === '#atproto_pds')?.serviceEndpoint ?? entryway

const dir = join(root, 'lexicons', ...config.namespace.split('.'))
const published = []
for (const file of (await readdir(dir)).filter((f) => f.endsWith('.json')).sort()) {
  const doc = JSON.parse(await readFile(join(dir, file), 'utf8'))
  const { uri, cid } = await xrpc(
    pds,
    'com.atproto.repo.putRecord',
    {
      repo: session.did,
      collection: 'com.atproto.lexicon.schema',
      rkey: doc.id,
      record: { $type: 'com.atproto.lexicon.schema', ...doc },
    },
    session.accessJwt,
  )
  published.push({ nsid: doc.id, uri, cid })
  console.log(`✓ published ${doc.id} ${cid}`)
}

await mkdir(join(root, 'release'), { recursive: true })
await writeFile(join(root, 'release/publication.json'), JSON.stringify({ publisher: session.did, records: published }, null, 2) + '\n')
