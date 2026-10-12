#!/usr/bin/env bash
# Clean-consumer check (PlaceProto spec section 6): copy the example and the
# pinned lexicons into an empty directory, install exactly what the lockfile
# says (npm ci), build the lexicons with the pinned @atproto/lex and run it.
# Never runs lex install, so it cannot pick up a newer schema.
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT

cp "$root/examples/consumer/package.json" "$root/examples/consumer/package-lock.json" \
   "$root/examples/consumer/tsconfig.json" "$work/"
cp -R "$root/examples/consumer/src" "$work/src"
cp -R "$root/lexicons" "$work/lexicons"
cp "$root/lexicons.json" "$work/lexicons.json"

cd "$work"
npm ci --no-audit --no-fund
npm run build
npm start
