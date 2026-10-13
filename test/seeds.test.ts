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

  it('rebuilds a published seed with its recorded keys exactly as published, so a re-run changes nothing', () => {
    const seed = japantownSeeds.seeds.find((s) => s.id === 'kabuki-appreciation-2026-10-15') ?? assert.fail()
    assert.deepEqual(seed.published, { eventRkey: '3mxrq3w4c2k2y', sidecarRkey: '3mxrq3w4c2l2y' })
    // The pair as published on 2026-10-13 (gtm/sample-event-record.md), read back from bsky.social.
    const pair = buildSeedRecords(seed, { repo, createdAt: '2026-10-13T19:06:40.937Z' })
    assert.equal(pair.eventRkey, '3mxrq3w4c2k2y')
    assert.equal(pair.sidecarRkey, '3mxrq3w4c2l2y')
    assert.deepEqual(pair.event, {
      $type: 'community.lexicon.calendar.event',
      name: 'Kabuki Theatre Appreciation Class with JETAANC',
      description:
        'Monthly kabuki theatre appreciation class with JETAANC at the Japanese Cultural and Community Center of Northern California, held on the third Thursday of the month. Free, donations welcome.\n\nListed by Iriai. Source: JCCCNC event page.',
      createdAt: '2026-10-13T19:06:40.937Z',
      startsAt: '2026-10-16T01:30:00.000Z',
      endsAt: '2026-10-16T03:30:00.000Z',
      mode: 'community.lexicon.calendar.event#inperson',
      status: 'community.lexicon.calendar.event#scheduled',
      locations: [
        {
          $type: 'community.lexicon.location.address',
          name: 'JCCCNC',
          street: '1840 Sutter St',
          locality: 'San Francisco',
          region: 'CA',
          postalCode: '94115',
          country: 'US',
        },
        { $type: 'community.lexicon.location.geo', name: 'JCCCNC', latitude: '37.7865506', longitude: '-122.4308591' },
      ],
      uris: [
        { uri: 'https://www.jcccnc.org/events/kabuki-theatre-appreciation-class-with-jetaanc/', name: 'JCCCNC event page' },
      ],
    })
    assert.deepEqual(pair.sidecar, {
      $type: 'app.iriai.proto.event',
      eventUri: 'at://did:plc:kd5s7zyp7nje43ievnqhgzrr/community.lexicon.calendar.event/3mxrq3w4c2k2y',
      location: { $type: 'community.lexicon.location.geo', name: 'JCCCNC', latitude: '37.7865506', longitude: '-122.4308591' },
    })
  })

  it('records keys only as valid, distinct TIDs', () => {
    for (const seed of japantownSeeds.seeds) {
      if (!seed.published) continue
      assert.ok(isValidTid(seed.published.eventRkey) && isValidTid(seed.published.sidecarRkey), seed.id)
      assert.notEqual(seed.published.eventRkey, seed.published.sidecarRkey, seed.id)
    }
  })

  it('writes the attendance mode, in person unless given', () => {
    const yosakoi = japantownSeeds.seeds.find((s) => s.id === 'yosakoi-intro-workshop-2026-10-16') ?? assert.fail()
    assert.equal(buildSeedRecords(yosakoi, { repo, createdAt }).event.mode, 'community.lexicon.calendar.event#hybrid')
    const { mode: _, ...inPerson } = yosakoi
    assert.equal(buildSeedRecords(inPerson, { repo, createdAt }).event.mode, 'community.lexicon.calendar.event#inperson')
  })

  it('lists the approved Japantown seeds, Oct 15 to 30, with the two-day kimono sale as one event a day', () => {
    assert.equal(japantownSeeds.seeds.length, 9)
    const kimono = japantownSeeds.seeds.filter((s) => s.id.startsWith('family-treasures-kimono-sale-'))
    assert.deepEqual(
      kimono.map((s) => [s.startsAt, s.endsAt]),
      [
        ['2026-10-24T11:00:00-07:00', '2026-10-24T16:00:00-07:00'],
        ['2026-10-25T11:00:00-07:00', '2026-10-25T16:00:00-07:00'],
      ],
    )
    for (const seed of japantownSeeds.seeds) {
      const start = new Date(seed.startsAt)
      assert.ok(start >= new Date('2026-10-15T00:00:00-07:00') && start < new Date('2026-10-31T00:00:00-07:00'), seed.id)
    }
  })
})
