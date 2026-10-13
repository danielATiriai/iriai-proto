import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { isValidTid } from '@atproto/syntax'
import { buildSeedRecords, config, japantownSeeds, namedPlaces, seedLabel } from '../src/index.js'

const repo = config.steward.did
const createdAt = '2026-10-13T12:00:00.000Z'

describe('seed events', () => {
  it('are written by the steward of the named-place list', () => {
    assert.deepEqual(config.steward, namedPlaces.steward)
  })

  it('have unique ids', () => {
    const ids = japantownSeeds.seeds.map((s) => s.id)
    assert.equal(new Set(ids).size, ids.length)
  })

  for (const seed of japantownSeeds.seeds) {
    it(`${seed.id}: builds a valid event and sidecar pair`, () => {
      const pair = buildSeedRecords(seed, { repo, createdAt })
      assert.ok(isValidTid(pair.eventRkey) && isValidTid(pair.sidecarRkey))
      assert.notEqual(pair.eventRkey, pair.sidecarRkey)
      assert.equal(pair.sidecar.eventUri, `at://${repo}/${config.communityEventCollection}/${pair.eventRkey}`)
      assert.match(pair.event.startsAt as string, /Z$/)
      assert.equal(pair.event.description, `${seed.description}\n\n${seedLabel(seed)}`)
      assert.match(pair.event.description as string, /Listed by Iriai\. Source: .+\.$/)
      assert.deepEqual(pair.event.locations, [
        (namedPlaces.places.find((p) => p.id === seed.place) ?? assert.fail()).address,
        pair.sidecar.location,
      ])
    })
  }

  it('converts local times with an offset to UTC', () => {
    const pair = buildSeedRecords(
      { ...japantownSeeds.seeds[0], startsAt: '2026-10-15T18:30:00-07:00', endsAt: '2026-10-15T20:30:00-07:00' },
      { repo, createdAt },
    )
    assert.equal(pair.event.startsAt, '2026-10-16T01:30:00.000Z')
    assert.equal(pair.event.endsAt, '2026-10-16T03:30:00.000Z')
  })

  it('refuses a time without an offset, an end before the start, or an unknown place', () => {
    const seed = japantownSeeds.seeds[0]
    assert.throws(() => buildSeedRecords({ ...seed, startsAt: '2026-10-15T18:30:00' }, { repo, createdAt }), /UTC offset/)
    assert.throws(
      () => buildSeedRecords({ ...seed, endsAt: '2026-10-15T18:00:00-07:00' }, { repo, createdAt }),
      /endsAt must be after startsAt/,
    )
    assert.throws(() => buildSeedRecords({ ...seed, place: 'nowhere' }, { repo, createdAt }), /unknown place/)
  })

  it('refuses a handle in place of the repository DID', () => {
    assert.throws(
      () => buildSeedRecords(japantownSeeds.seeds[0], { repo: config.steward.handle, createdAt }),
      /eventUri must use the repository DID/,
    )
  })
})
