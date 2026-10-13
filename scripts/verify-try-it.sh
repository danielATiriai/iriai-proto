#!/usr/bin/env bash
# Twenty-line example check (slice 3.2): copy examples/try-it into an empty
# directory as a developer would get it, install exactly what its lockfile
# says, fetch the pinned v0.1.0 bundle (SHA-256 checked), build the lexicons
# from it and run the example against the live query API. Fails unless at
# least one event comes back.
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

cp "$root/examples/try-it/package.json" "$root/examples/try-it/package-lock.json" \
   "$root/examples/try-it/tsconfig.json" "$root/examples/try-it/get-release.mjs" "$work/"
cp -R "$root/examples/try-it/src" "$work/src"

cd "$work"
npm ci --no-audit --no-fund
npm run release
npm run build
npm start | tee output.txt
grep -Eq '^[1-9][0-9]* PlaceProto events' output.txt
