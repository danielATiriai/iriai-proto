# Try PlaceProto in twenty lines

Query the live PlaceProto index for events near Japantown Peace Plaza and check every result against the IriaiProto v0.1.0 contracts. The contracts come from the pinned release, never a floating latest: `get-release.mjs` downloads the v0.1.0 bundle and refuses it unless its SHA-256 matches, and `lex build` generates the TypeScript validators from the bundle's lexicons with an exact `@atproto/lex`.

Needs Node 22 or later.

```bash
git clone https://github.com/danielATiriai/iriai-proto
cd iriai-proto/examples/try-it
npm ci
npm run release
npm run build
npm start
```

[`src/index.ts`](src/index.ts) is the whole example:

```ts
import { app, community } from './lexicons/index.js'

const peacePlaza = { latitude: '37.785054', longitude: '-122.429827' }
const query = new URLSearchParams({ ...peacePlaza, radiusMeters: '1000', limit: '20' })
const queryUrl = process.env.QUERY_URL ?? 'https://query.iriai.app'

const response = await fetch(`${queryUrl}/xrpc/app.iriai.proto.queryEvents?${query}`)
if (!response.ok) throw new Error(`queryEvents answered ${response.status}: ${await response.text()}`)
const { events } = (await response.json()) as { events: unknown[] }

for (const item of events) {
  const view = app.iriai.proto.defs.eventView.$parse(item)
  const event = community.lexicon.calendar.event.$parse(view.event)
  app.iriai.proto.event.$parse({ $type: 'app.iriai.proto.event', eventUri: view.eventUri, location: view.location })
  const place = (view.location as { name?: string }).name ?? view.location.$type
  console.log(`${event.startsAt ?? 'no start time'}  ${event.name}  at ${place}`)
  console.log(`  ${view.uri}`)
}

console.log(`${events.length} PlaceProto events within 1 km of Japantown Peace Plaza`)
```

Each result is an `app.iriai.proto.defs#eventView`: the community calendar event as its author wrote it, plus the PlaceProto sidecar's required location. The events come from any app that writes the two records; today they are the real Japantown happenings listed by Iriai's steward account, events.iriai.app.

The query API is open with per-caller rate limits, labelled interim. Its parameters (radius or box, time window, author, sort by distance or start time, cursors) are in the [query service README](https://github.com/danielATiriai/iriai-proto-index#query-api). The **Try-it example** workflow runs exactly these steps from a clean copy once a day and on every change.
