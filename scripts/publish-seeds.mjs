// Publishes approved seed events from the steward account (events.iriai.app).
// Each seed is one community.lexicon.calendar.event plus its PlaceProto
// sidecar, committed together in one com.atproto.repo.applyWrites batch so
// neither exists without the other.
//
// A seed whose record keys are recorded in the seed list ("published") is
// corrected in place: the pair is rebuilt with the same keys and createdAt,
// and any record that differs is updated in one batch guarded by swapCommit.
// It is never created a second time. A seed without recorded keys that is
// already in the steward's repository (same source URL and start time) is
// reported, not written again. An unrecorded event that shares a seed's
// source URL but not its start time, and is not another seed in the list,
// stops the run, because that is what an edited but unrecorded seed looks
// like; record its keys first.
//
//   node scripts/publish-seeds.mjs --seeds <id,id> [--dry-run]
//
// Live runs need STEWARD_APP_PASSWORD (the iriai-seeding app password), which
// only the protected "steward" environment holds. Run `npm run build` first.
import { fileURLToPath } from 'node:url'
import { appendFile, mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { parseArgs } from 'node:util'
import { buildSeedRecords, config, eventSidecarNsid, findSeed, japantownSeeds } from '../dist/src/index.js'

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

const recordedEventRkeys = new Set(japantownSeeds.seeds.flatMap((s) => (s.published ? [s.published.eventRkey] : [])))
// Seeds can share a source (one listing for a two-day event); an event that is
// exactly another seed in the list is that seed, not an edited copy of this one.
const listedSeedKeys = new Set(japantownSeeds.seeds.map((s) => `${s.source} ${new Date(s.startsAt).toISOString()}`))

for (const seed of seeds) {
  if (seed.published) {
    results.push(await correct(seed))
    continue
  }

  const startsAt = new Date(seed.startsAt).toISOString()
  const sameSource = existingEvents.filter((r) => (r.value.uris ?? []).some((u) => u.uri === seed.source))
  const found = sameSource.find((r) => r.value.startsAt === startsAt)
  if (found) {
    const sidecar = existingSidecars.find((r) => r.value.eventUri === found.uri)
    console.log(`• ${seed.id} already published: ${found.uri}${sidecar ? '' : ' (no sidecar found)'}`)
    console.log(`  record its keys in the seed list: eventRkey ${rkeyOf(found.uri)}${sidecar ? `, sidecarRkey ${rkeyOf(sidecar.uri)}` : ''}`)
    results.push({ seed: seed.id, status: 'existing', event: pick(found), sidecar: sidecar ? pick(sidecar) : null })
    continue
  }
  const unrecorded = sameSource.filter(
    (r) => !recordedEventRkeys.has(rkeyOf(r.uri)) && !listedSeedKeys.has(`${seed.source} ${r.value.startsAt}`),
  )
  if (unrecorded.length) {
    fail(
      `${seed.id}: the steward already has an event from this source at another time (${unrecorded.map((r) => r.uri).join(', ')}). ` +
        'If it is this seed, record its keys under "published" so the run corrects it in place.',
    )
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
  const { event, sidecar } = await readBack(seed, pair, eventWrite?.cid, sidecarWrite?.cid)
  console.log(`✓ ${seed.id} published: ${event.uri}`)
  console.log(`  record its keys in the seed list: eventRkey ${pair.eventRkey}, sidecarRkey ${pair.sidecarRkey}`)
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

// Rebuilds a published seed with its recorded keys and original createdAt and
// updates whichever records differ, in one batch that fails if the repository
// moved since it was read (swapCommit).
async function correct(seed) {
  const { eventRkey, sidecarRkey } = seed.published
  const current = {
    event: await getRecord(collection, eventRkey, { allowMissing: true }),
    sidecar: await getRecord(eventSidecarNsid, sidecarRkey, { allowMissing: true }),
  }
  if (!current.event || !current.sidecar) {
    fail(`${seed.id}: recorded ${!current.event ? 'event' : 'sidecar'} is missing from the steward's repository; not recreating it`)
  }
  const pair = buildSeedRecords(seed, { repo: steward.did, createdAt: current.event.value.createdAt })
  const writes = []
  if (!sameRecord(current.event.value, pair.event)) {
    writes.push({ $type: 'com.atproto.repo.applyWrites#update', collection, rkey: eventRkey, value: pair.event })
  }
  if (!sameRecord(current.sidecar.value, pair.sidecar)) {
    writes.push({ $type: 'com.atproto.repo.applyWrites#update', collection: eventSidecarNsid, rkey: sidecarRkey, value: pair.sidecar })
  }
  if (writes.length === 0) {
    console.log(`• ${seed.id} is published and unchanged: ${current.event.uri}`)
    return { seed: seed.id, status: 'unchanged', event: pick(current.event), sidecar: pick(current.sidecar) }
  }

  const head = await xrpcGet(pds, 'com.atproto.sync.getLatestCommit', new URLSearchParams({ did: steward.did }))
  const commit = await xrpc(pds, 'com.atproto.repo.applyWrites', { repo: steward.did, swapCommit: head.cid, writes }, auth)
  const cids = Object.fromEntries(writes.map((w, i) => [w.collection, commit.results?.[i]?.cid]))
  const { event, sidecar } = await readBack(seed, pair, cids[collection], cids[eventSidecarNsid])
  for (const [name, after] of [['event', pair.event], ['sidecar', pair.sidecar]]) {
    const read = name === 'event' ? event : sidecar
    if (!sameRecord(read.value, after)) fail(`${seed.id}: ${name} read back does not match the correction`)
  }
  const changed = writes.map((w) => (w.collection === collection ? 'event' : 'sidecar')).join(' and ')
  console.log(`✓ ${seed.id} corrected in place (${changed}): ${event.uri}`)
  return { seed: seed.id, status: 'corrected', commit: commit.commit, event: pick(event), sidecar: pick(sidecar) }
}

// Reads both records back from the PDS and checks they are the ones committed.
async function readBack(seed, pair, eventCid, sidecarCid) {
  const event = await getRecord(collection, pair.eventRkey)
  const sidecar = await getRecord(eventSidecarNsid, pair.sidecarRkey)
  if (eventCid && event.cid !== eventCid) fail(`${seed.id}: event read back with a different CID`)
  if (sidecarCid && sidecar.cid !== sidecarCid) fail(`${seed.id}: sidecar read back with a different CID`)
  if (sidecar.value.eventUri !== event.uri) fail(`${seed.id}: sidecar eventUri does not match the event`)
  return { event, sidecar }
}

function sameRecord(a, b) {
  return canonical(a) === canonical(b)
}

function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`
  if (value && typeof value === 'object') {
    return `{${Object.keys(value).sort().map((k) => `${JSON.stringify(k)}:${canonical(value[k])}`).join(',')}}`
  }
  return JSON.stringify(value)
}

function rkeyOf(uri) {
  return uri.split('/').pop()
}

function pick(record) {
  return { uri: record.uri, cid: record.cid, value: record.value }
}

async function getRecord(coll, rkey, { allowMissing = false } = {}) {
  const params = new URLSearchParams({ repo: steward.did, collection: coll, rkey })
  try {
    return await xrpcGet(pds, 'com.atproto.repo.getRecord', params)
  } catch (err) {
    if (allowMissing && err.error === 'RecordNotFound') return null
    throw err
  }
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
  if (!res.ok) {
    throw Object.assign(new Error(`${method} failed (${res.status}): ${json.error ?? ''} ${json.message ?? ''}`), { error: json.error })
  }
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
