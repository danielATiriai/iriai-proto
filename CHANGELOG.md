# Changelog

## Unreleased

- Seed events: `seeds/japantown-2026-10.json`, `buildSeedRecords()` and the **Publish seed events** workflow, which writes each seed's community event and sidecar from events.iriai.app in one `applyWrites` batch (BUILD-002, BUILD-006). No lexicon changes.
- Seed corrections update in place: a seed with recorded record keys (`published`) is rebuilt with the same keys and `createdAt` and updated in one `swapCommit` batch, never created again. Seeds may set an attendance `mode`. The other seven approved Japantown seeds (Oct 15 to 30) are in the list, with the two-day kimono sale as one event per day (BUILD-006).
- All nine Japantown seeds are published from events.iriai.app (run 2026-10-13) and their record keys are recorded in the seed list, so any later edit to one of them is a correction in place.

## 0.1.0

First contracts release (slice 1.1, BUILD-001).

- `app.iriai.proto.event`: the PlaceProto event sidecar, key `tid`, with required `eventUri` (at-uri, Agreed 2026-10-11) and required `location`.
- `app.iriai.proto.defs`: `eventView` and `eventVersion`.
- One Location union (geo, address, fsq, hthree; open) generated into every record and view from `authoring/location.json`.
- Vendored `community.lexicon.calendar.event`, `community.lexicon.calendar.rsvp`, the four `community.lexicon.location.*` variants and `com.atproto.repo.strongRef`, pinned by URI and CID.
- Fixtures for every Location variant, an unknown variant, and the writer's rejection cases.
- Named-place list 1.0.0 for Japantown: Peace Plaza, JCCCNC, New People Cinema, Christ United Presbyterian Church, Buddhist Church of San Francisco.

Not in this release: the Post sidecar and the method lexicons (createEvent, deleteEvent, getEvent, queryEvents and the rest). They follow in a compatible 0.2.0.
