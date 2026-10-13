import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { packageRoot } from './contracts.js'

export interface NamedPlace {
  id: string
  name: string
  address: Record<string, unknown> & { $type: 'community.lexicon.location.address' }
  location: { $type: 'community.lexicon.location.geo'; latitude: string; longitude: string; name?: string }
  source: string
  coordinatesSource: string
  coordinatesVerified: boolean
}

export interface NamedPlaceList {
  version: string
  description: string
  steward: { handle: string; did: string }
  places: NamedPlace[]
}

/** The versioned named-place list shipped in the contracts release (decision 6a, D-26). */
export const namedPlaces: NamedPlaceList = JSON.parse(
  readFileSync(join(packageRoot, 'places', 'japantown.json'), 'utf8'),
)

export function findPlace(id: string): NamedPlace | undefined {
  return namedPlaces.places.find((p) => p.id === id)
}
