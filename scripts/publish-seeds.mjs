// Publishes approved seed events from the steward account (events.iriai.app).
// Each seed is one community.lexicon.calendar.event plus its PlaceProto
// sidecar, committed together in one com.atproto.repo.applyWrites batch so
// neither exists without the other. A seed already in the steward's
// repository (same source URL and start time) is reported, not written again,
// so a re-run after an unclear failure never duplicates an event.
//
//   node scripts/publish-seeds.mjs --seeds <id,id> [--dry-run]
//
// Live runs need STEWARD_APP_PASSWORD (the iriai-seeding app password), which
// only the protected "steward" environment holds. Run `npm run build` first.
import { fileURLToPath } from 'node:url'
import { appendFile, mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { parseArgs } from 'node:util'
import { buildSeedRecords, config, eventSidecarNsid, findSeed } from '../dist/src/index.js'

const root = fileURLToPath(new URL('..', import.meta.url))
const { values } = parseArgs({ options: { seeds: { type: 'string' }, 'dry-run': { type: 'boolean', default: false } } })
const ids = [...new Set((values.seeds ?? '').split(',').map((s) => s.trim()).filter(Boolean))]
if (ids.length === 0) fail('pass --seeds with one or more seed ids')
const seeds = ids.map((id) => findSeed(id) ?? fail(`unknown seed ${id}`))
const steward = config.steward
const collection = config.communityEventCollection

if (values['dry-run']) {
  for (const seed of seeds) {
    const pair = buildSeedRecords(seed, { repo: steward.did, createdAt: new Date().toISOString() })
    console.log(`✓ ${seed.id} builds a valid event and sidecar`)
    console.log(JSON.stringify({ event: pair.event, sidecar: pair.sidecar }, null, 2))
  }
  process.exit(0)
}

const password = process.env.STEWARD_APP_PASSWORD
if (!password) fail('STEWARD_APP_PASSWORD is not set')
const entryway = process.env.STEWARD_SERVICE ?? 'https://bsky.social'

const session = await xrpc(entryway, 'com.atproto.server.createSession', { identifier: steward.handle, password })
if (session.did !== steward.did) fail(`signed in as ${session.did}, expected steward ${steward.did}`)
const pds = session.didDoc?.service?.find((s) => s.id === '#atproto_pds')?.serviceEndpoint ?? entryway
const auth = session.accessJwt

const existingEvents = await listAll(collection)
const existingSidecars = await listAll(eventSidecarNsid)
const results = []

for (const seed of seeds) {
  const startsAt = new Date(seed.startsAt).toISOString()
  const found = existingEvents.find(
    (r) => r.value.startsAt === startsAt && (r.value.uris ?? []).some((u) => u.uri === seed.source),
  )
  if (found) {
    const sidecar = existingSidecars.find((r) => r.value.eventUri === found.uri)
    console.log(`• ${seed.id} already published: ${found.uri}${sidecar ? '' : ' (no sidecar found)'}`)
    results.push({ seed: seed.id, status: 'existing', event: pick(found), sidecar: sidecar ? pick(sidecar) : null })
    continue
  }

  const pair = buildSeedRecords(seed, { repo: steward.did, createdAt: new Date().toISOString() })
  const commit = await xrpc(
    pds,
    'com.atproto.repo.applyWrites',
    {
      repo: steward.did,
      writes: [
        { $type: 'com.atproto.repo.applyWrites#create', collection, rkey: pair.eventRkey, value: pair.event },
        { $type: 'com.atproto.repo.applyWrites#create', collection: eventSidecarNsid, rkey: pair.sidecarRkey, value: pair.sidecar },
      ],
    },
    auth,
  )
  const [eventWrite, sidecarWrite] = commit.results ?? []

  // Read both back from the PDS and check they are the records just committed.
  const event = await getRecord(collection, pair.eventRkey)
  const sidecar = await getRecord(eventSidecarNsid, pair.sidecarRkey)
  if (eventWrite?.cid && event.cid !== eventWrite.cid) fail(`${seed.id}: event read back with a different CID`)
  if (sidecarWrite?.cid && sidecar.cid !== sidecarWrite.cid) fail(`${seed.id}: sidecar read back with a different CID`)
  if (sidecar.value.eventUri !== event.uri) fail(`${seed.id}: sidecar eventUri does not match the event`)
  console.log(`✓ ${seed.id} published: ${event.uri}`)
  results.push({ seed: seed.id, status: 'published', commit: commit.commit, event: pick(event), sidecar: pick(sidecar) })
}

await mkdir(join(root, 'release'), { recursive: true })
await writeFile(
  join(root, 'release/seeds-publication.json'),
  JSON.stringify({ steward, pds, publishedAt: new Date().toISOString(), results }, null, 2) + '\n',
)
if (process.env.GITHUB_STEP_SUMMARY) {
  const lines = ['| Seed | Status | Event | Sidecar |', '|---|---|---|---|']
  for (const r of results) {
    const link = (rec) => (rec ? `[${rec.uri.split('/').pop()}](https://pdsls.dev/${rec.uri})` : 'missing')
    lines.push(`| ${r.seed} | ${r.status} | ${link(r.event)} | ${link(r.sidecar)} |`)
  }
  await appendFile(process.env.GITHUB_STEP_SUMMARY, `## Seed events\n\n${lines.join('\n')}\n`)
}

// An event with no sidecar is not a PlaceProto event; stop so someone looks.
const orphaned = results.filter((r) => !r.sidecar)
if (orphaned.length) fail(`event without a sidecar: ${orphaned.map((r) => r.event.uri).join(', ')}`)

function pick(record) {
  return { uri: record.uri, cid: record.cid, value: record.value }
}

async function getRecord(coll, rkey) {
  const params = new URLSearchParams({ repo: steward.did, collection: coll, rkey })
  return xrpcGet(pds, 'com.atproto.repo.getRecord', params)
}

async function listAll(coll) {
  const records = []
  let cursor
  do {
    const params = new URLSearchParams({ repo: steward.did, collection: coll, limit: '100' })
    if (cursor) params.set('cursor', cursor)
    const page = await xrpcGet(pds, 'com.atproto.repo.listRecords', params)
    records.push(...page.records)
    cursor = page.records.length ? page.cursor : undefined
  } while (cursor)
  return records
}

async function xrpcGet(service, method, params) {
  const res = await fetch(`${service}/xrpc/${method}?${params}`)
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(`${method} failed (${res.status}): ${json.error ?? ''} ${json.message ?? ''}`)
  return json
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

function fail(message) {
  console.error(`✗ ${message}`)
  process.exit(1)
}
