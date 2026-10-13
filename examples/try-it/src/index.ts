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
