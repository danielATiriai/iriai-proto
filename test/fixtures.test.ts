import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { describe, it } from 'node:test'
import assert from 'node:assert/strict'
import { config, resolveLocation, validateEventSidecar } from '../src/index.js'
import { packageRoot } from '../src/contracts.js'

interface Fixture {
  description: string
  repo: string
  record: unknown
  expect: 'valid' | 'invalid'
  resolution?: Record<string, unknown>
  roundTrip?: boolean
}

/** Fixtures write "{ns}" for the configured namespace, so they follow a namespace move. */
function expand(value: unknown): unknown {
  if (typeof value === 'string') return value.replaceAll('{ns}', config.namespace)
  if (Array.isArray(value)) return value.map(expand)
  if (value && typeof value === 'object')
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, expand(v)]))
  return value
}

function load(kind: 'valid' | 'invalid'): [string, Fixture][] {
  const dir = join(packageRoot, 'fixtures', kind)
  return readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .sort()
    .map((f) => [f, expand(JSON.parse(readFileSync(join(dir, f), 'utf8'))) as Fixture])
}

describe('valid sidecar fixtures', () => {
  for (const [name, fixture] of load('valid')) {
    it(`${name}: ${fixture.description}`, () => {
      assert.equal(fixture.expect, 'valid')
      const result = validateEventSidecar(fixture.record, { repo: fixture.repo })
      assert.ok(result.ok, `expected valid, got ${JSON.stringify(result)}`)
      if (fixture.roundTrip) {
        assert.deepEqual(JSON.parse(JSON.stringify(result.value)), fixture.record)
      }
      if (fixture.resolution) {
        const resolved = resolveLocation(result.value.location) as Record<string, unknown>
        for (const [key, expected] of Object.entries(fixture.resolution)) {
          if (typeof expected === 'number' && typeof resolved[key] === 'number') {
            assert.ok(Math.abs((resolved[key] as number) - expected) < 1e-9, `${key}: ${resolved[key]} != ${expected}`)
          } else {
            assert.equal(resolved[key], expected, `resolution.${key}`)
          }
        }
      }
    })
  }
})

describe('invalid sidecar fixtures', () => {
  for (const [name, fixture] of load('invalid')) {
    it(`${name}: ${fixture.description}`, () => {
      assert.equal(fixture.expect, 'invalid')
      const result = validateEventSidecar(fixture.record, { repo: fixture.repo })
      assert.equal(result.ok, false, `expected InvalidRequest for ${name}`)
      if (!result.ok) assert.equal(result.error, 'InvalidRequest')
    })
  }
})
