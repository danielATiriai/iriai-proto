# iriai-proto

Record contracts for IriaiProto, the first namespace of PlaceProto: the event sidecar, the shared Location definition, fixtures and the named-place list. Releases are pinned git tags; services and apps consume a tag, never a floating latest.

The record namespace is `app.iriai.proto` and is read from [`iriai-proto.config.json`](iriai-proto.config.json). The later move to `org.placeproto` is a configuration change plus a new release (D-30).

## What is in a release

| Path | What it is |
|---|---|
| `lexicons/app/iriai/proto/` | Our lexicons, generated from `authoring/`: `event` (the sidecar record) and `defs` (`eventView`, `eventVersion`) |
| `lexicons/community/`, `lexicons/com/` | Vendored community schemas, unchanged, pinned by publisher URI and CID in `lexicons.json` (MIT, see `lexicons/community/LICENSE`) |
| `fixtures/` | Valid and invalid sidecars for every Location variant, including an unknown variant that must round-trip unresolved |
| `places/japantown.json` | The versioned named-place list for YC, stewarded by events.iriai.app |
| `src/` | Shared code: `validateEventSidecar`, `checkLocation`, `resolveLocation`, `compatibilityLocations`, `namedPlaces` |

## The sidecar

A PlaceProto event is a `community.lexicon.calendar.event` record plus an `app.iriai.proto.event` sidecar in the same repository:

```json
{
  "$type": "app.iriai.proto.event",
  "eventUri": "at://did:plc:…/community.lexicon.calendar.event/3lzkvx7ysb22c",
  "location": {
    "$type": "community.lexicon.location.geo",
    "latitude": "37.785054",
    "longitude": "-122.429827",
    "name": "Japantown Peace Plaza"
  }
}
```

`eventUri` must name the community event collection in the same repository, by DID. `location` is one value from the open union of geo, address, fsq and hthree; unknown variants are kept and left unresolved. The community event's `locations` array is a compatibility copy of the sidecar location.

## Commands

```bash
npm ci
npm run generate         # regenerate lexicons/app/... from authoring/
npm run validate         # generated == committed, one Location union, compatible with the last release, lexicon docs, build, tests
npm run build            # lex build (generated TypeScript) + tsc
npm run verify-consumer  # clean consumer: npm ci + lex build from the pinned lexicons, no lex install
```

Tool versions are exact pins in `package.json` and `package-lock.json`. `lex install` runs only in the **Sync lexicons** workflow, which resolves the vendored schemas from the network and commits their pins.

## Releasing

One-time setup, before the first tag is pushed (GitHub creates a missing environment with no protection):

- An environment named `release` with Daniel as required reviewer and the secret `PUBLISHER_APP_PASSWORD`.
- A tag ruleset for `v*` that restricts creation, update and deletion, so an approved tag cannot be moved.

Then for each release:

1. Every place in `places/japantown.json` has `coordinatesVerified: true`, and `CHANGELOG.md` has a section for the version in `package.json`.
2. Push tag `v<version>`. The **Release** workflow checks the tagged commit, then waits for approval of the `release` environment.
3. After approval it publishes our lexicons as `com.atproto.lexicon.schema` records from publisher.iriai.app, resolves them back through `_lexicon.proto.iriai.app`, writes `release-manifest.json` (commit, record URIs and CIDs, pins, tool versions, who approved) and creates the GitHub release with the checksummed bundle.

The publisher app password is only in the `release` environment secret `PUBLISHER_APP_PASSWORD`.

## Seed events

`seeds/japantown-2026-10.json` lists the real, sourced Japantown events the steward account (events.iriai.app, D-26) publishes. Each seed becomes one `community.lexicon.calendar.event` and its `app.iriai.proto.event` sidecar, written together in one `applyWrites` batch with the record keys chosen first, so neither record exists without the other. The event's `locations` carry the place's address and a copy of the sidecar location for apps that only read the community event.

One-time setup: an environment named `steward` with Daniel as required reviewer, deployments limited to `main`, and the secret `STEWARD_APP_PASSWORD` (the `iriai-seeding` app password for events.iriai.app).

To publish, run the **Publish seed events** workflow from `main` with the seed ids and `dry_run` unticked, then approve the `steward` environment. A seed already in the steward's repository (same source URL and start time) is reported, not written again, and the run prints its record keys.

To correct a published seed, record its keys under `published` (`eventRkey`, `sidecarRkey`) in the seed list, edit the seed, and run the workflow again. The pair is rebuilt with the same keys and original `createdAt`, and whichever record changed is updated in place in one batch guarded by `swapCommit`; a recorded seed is never created twice, and one whose records are missing stops the run rather than being recreated. An unrecorded event from the same source at a different time also stops the run, since that is what an edited but unrecorded seed looks like. `node scripts/publish-seeds.mjs --dry-run --seeds <id>` prints the records locally after `npm run build`.
