// Built from a clean checkout against the pinned release's lexicons/ and
// lexicons.json, with no network access beyond npm.
import { app } from './lexicons/index.js'

const repo = 'did:web:fixtures.iriai.app'
const sidecar = app.iriai.proto.event.$build({
  eventUri: `at://${repo}/community.lexicon.calendar.event/3lzkvx7ysb22c`,
  location: {
    $type: 'community.lexicon.location.geo',
    latitude: '37.785054',
    longitude: '-122.429827',
    name: 'Japantown Peace Plaza',
  },
})

const ok = app.iriai.proto.event.$safeParse(sidecar)
const bad = app.iriai.proto.event.$safeParse({ ...sidecar, eventUri: 'not-an-at-uri' })
if (!ok.success || bad.success) {
  throw new Error('consumer check failed: the valid sidecar must pass and the bad one must fail')
}
console.log('✓ clean consumer built the pinned lexicons and validated a sidecar')
