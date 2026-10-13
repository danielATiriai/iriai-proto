import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { compatibilityLocations, config, defsNsid, eventSidecarNsid, lexicons } from '../src/index.js'

describe('lexicons', () => {
  it('reads the namespace from configuration', () => {
    assert.equal(eventSidecarNsid, `${config.namespace}.event`)
    assert.ok(lexicons.getDef(eventSidecarNsid))
    assert.ok(lexicons.getDef(`${defsNsid}#eventView`))
    assert.ok(lexicons.getDef(`${defsNsid}#eventVersion`))
  })

  it('pins the community records the ATProto service validates (SPEC-018 section 3)', () => {
    for (const nsid of ['community.lexicon.calendar.event', 'community.lexicon.calendar.rsvp']) {
      assert.ok(lexicons.getDef(nsid), nsid)
    }
  })

  it('validates a complete event view', () => {
    const view = {
      uri: 'at://did:web:fixtures.iriai.app/app.iriai.proto.event/3lzkvx7ysb22d',
      eventUri: 'at://did:web:fixtures.iriai.app/community.lexicon.calendar.event/3lzkvx7ysb22c',
      event: { $type: 'community.lexicon.calendar.event', name: 'Fixture', createdAt: '2026-10-13T00:00:00.000Z' },
      location: { $type: 'community.lexicon.location.geo', latitude: '37.785054', longitude: '-122.429827' },
      version: {
        eventCid: 'bafyreie5737gdxlw5i64vzichcalba3z2v5n6icifvx5xytvske7mr3hpm',
        sidecarCid: 'bafyreie5737gdxlw5i64vzichcalba3z2v5n6icifvx5xytvske7mr3hpm',
      },
    }
    const result = lexicons.validate(`${defsNsid}#eventView`, view)
    assert.ok(result.success, !result.success ? result.error.message : '')
  })

  it('copies only known Location variants into the community event locations array', () => {
    const geo = { $type: 'community.lexicon.location.geo', latitude: '1', longitude: '2' }
    assert.deepEqual(compatibilityLocations(geo), [geo])
    assert.deepEqual(compatibilityLocations({ $type: 'org.example.place.ref' }), [])
  })
})
