import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { TID } from '@atproto/common-web'
import { config, eventSidecarNsid, lexicons, packageRoot } from './contracts.js'
import { compatibilityLocations } from './location.js'
import { findPlace } from './places.js'
import { validateEventSidecar, type EventSidecar } from './sidecar.js'

export interface Seed {
  id: string
  name: string
  description: string
  /** Local time with its UTC offset; written to the record in UTC. */
  startsAt: string
  endsAt?: string
  /** Id of a place in the named-place list. */
  place: string
  source: string
  sourceName?: string
}

export interface SeedList {
  description: string
  approved: string
  seeds: Seed[]
}

/** Approved Japantown seed events, written by the steward account (D-26). */
export const japantownSeeds: SeedList = JSON.parse(
  readFileSync(join(packageRoot, 'seeds', 'japantown-2026-10.json'), 'utf8'),
)

export function findSeed(id: string): Seed | undefined {
  return japantownSeeds.seeds.find((s) => s.id === id)
}

export interface SeedRecords {
  eventRkey: string
  sidecarRkey: string
  eventUri: string
  event: Record<string, unknown> & { $type: string }
  sidecar: EventSidecar
}

/**
 * Builds the pair a writer commits for one seed (PlaceProto section 2): the
 * community calendar event and its PlaceProto sidecar, with record keys chosen
 * up front so the sidecar's eventUri is known before the single applyWrites
 * batch. The event's locations carry the place's address plus a compatibility
 * copy of the sidecar location. Throws if either record fails validation.
 */
export function buildSeedRecords(
  seed: Seed,
  opts: { repo: string; createdAt: string; eventRkey?: string; sidecarRkey?: string },
): SeedRecords {
  const place = findPlace(seed.place)
  if (!place) throw new Error(`${seed.id}: unknown place ${seed.place}`)
  if (!place.coordinatesVerified) throw new Error(`${seed.id}: place ${seed.place} is not verified`)
  if (!seed.source.startsWith('https://')) throw new Error(`${seed.id}: source must be an https URL`)

  const startsAt = toUtc(seed.startsAt, `${seed.id}: startsAt`)
  const endsAt = seed.endsAt ? toUtc(seed.endsAt, `${seed.id}: endsAt`) : undefined
  if (endsAt && endsAt <= startsAt) throw new Error(`${seed.id}: endsAt must be after startsAt`)

  const collection = config.communityEventCollection
  const eventRkey = opts.eventRkey ?? TID.nextStr()
  const sidecarRkey = opts.sidecarRkey ?? TID.nextStr(eventRkey)
  const eventUri = `at://${opts.repo}/${collection}/${eventRkey}`

  const event = {
    $type: collection,
    name: seed.name,
    description: seed.description,
    createdAt: opts.createdAt,
    startsAt,
    ...(endsAt ? { endsAt } : {}),
    mode: `${collection}#inperson`,
    status: `${collection}#scheduled`,
    locations: [structuredClone(place.address), ...compatibilityLocations(place.location)],
    uris: [{ uri: seed.source, ...(seed.sourceName ? { name: seed.sourceName } : {}) }],
  }
  lexicons.assertValidRecord(collection, event)

  const result = validateEventSidecar(
    { $type: eventSidecarNsid, eventUri, location: structuredClone(place.location) },
    { repo: opts.repo },
  )
  if (!result.ok) throw new Error(`${seed.id}: invalid sidecar: ${result.issues.join('; ')}`)

  return { eventRkey, sidecarRkey, eventUri, event, sidecar: result.value }
}

function toUtc(value: string, label: string): string {
  if (!/(Z|[+-]\d{2}:\d{2})$/.test(value)) throw new Error(`${label} must carry a UTC offset`)
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) throw new Error(`${label} is not a valid date-time`)
  return date.toISOString()
}
