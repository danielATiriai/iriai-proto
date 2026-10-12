import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { isValidDid } from '@atproto/syntax'
import { checkLocation, lexicons, namedPlaces, resolveLocation } from '../src/index.js'

// A generous box around Japantown, to catch swapped or mistyped coordinates.
const BOX = { south: 37.78, north: 37.792, west: -122.436, east: -122.423 }

describe('named places', () => {
  it('has a semver version, a steward DID and unique ids', () => {
    assert.match(namedPlaces.version, /^\d+\.\d+\.\d+$/)
    assert.ok(isValidDid(namedPlaces.steward.did))
    const ids = namedPlaces.places.map((p) => p.id)
    assert.equal(new Set(ids).size, ids.length)
  })

  for (const place of namedPlaces.places) {
    it(`${place.id}: valid geo and address inside Japantown`, () => {
      assert.deepEqual(checkLocation(place.location), [])
      const geo = lexicons.validate('community.lexicon.location.geo', place.location)
      assert.ok(geo.success, `geo: ${!geo.success && geo.error.message}`)
      const address = lexicons.validate('community.lexicon.location.address', place.address)
      assert.ok(address.success, `address: ${!address.success && address.error.message}`)
      const point = resolveLocation(place.location)
      assert.equal(point.status, 'resolved')
      if (point.status === 'resolved') {
        assert.ok(point.latitude > BOX.south && point.latitude < BOX.north, 'latitude outside Japantown')
        assert.ok(point.longitude > BOX.west && point.longitude < BOX.east, 'longitude outside Japantown')
      }
      assert.ok(place.source.startsWith('https://'))
      assert.equal(typeof place.coordinatesVerified, 'boolean')
    })
  }
})
