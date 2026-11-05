#!/usr/bin/env bash
# Smoke test of the live portal (curl). Run from the repo root of the deployed commit.
#   smoke.sh BASE_URL SHA      BASE_URL without trailing slash, e.g. https://play.vintoshine.com
# A query string bypasses caches. Games are reached through the service bindings.
set -euo pipefail
base=${1:?usage: smoke.sh BASE_URL SHA}
sha=${2:?usage: smoke.sh BASE_URL SHA}
cb=${RUN_ID:-$(date +%s)}

fail() { echo "::error::$*"; exit 1; }
fetch() { curl -fsSL --retry 5 --retry-all-errors --retry-delay 3 "$1?cb=$cb"; }

live=
for _ in $(seq 1 12); do   # a new version may need a moment at the edge
  live=$(fetch "$base/build.json" 2>/dev/null | sed -n 's/.*"sha":"\([^"]*\)".*/\1/p' || true)
  [ "$live" = "$sha" ] && break
  sleep 5
done
[ "$live" = "$sha" ] || fail "build.json shows '${live:-nothing}', expected $sha"

for p in portal.js match.js lang.js portal.css; do
  fetch "$base/$p" > /dev/null || fail "/$p is not served"
done
fetch "$base/" | grep -q 'id="data"' || fail "the portal page has no data block"

for slug in $(sed -n 's/.*"slug": *"\([^"]*\)".*/\1/p' games.json); do
  for p in "$slug" "$slug/" "$slug/build.json"; do
    code=$(curl -s -o /dev/null -w '%{http_code}' -L "$base/$p?cb=$cb")
    [ "$code" = 200 ] || fail "/$p answers HTTP $code (service binding to the game broken?)"
  done
done

code=$(curl -s -o /dev/null -w '%{http_code}' "$base/_headers?cb=$cb")
[ "$code" = 404 ] || fail "/_headers is public (HTTP $code)"
headers=$(curl -sSI "$base/?cb=$cb")
grep -qi '^x-content-type-options: *nosniff' <<< "$headers" || fail "nosniff header missing"
grep -qi '^content-security-policy:.*frame-ancestors' <<< "$headers" || fail "CSP header missing"
echo "Smoke test passed: $base is $sha"
