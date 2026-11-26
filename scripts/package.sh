#!/usr/bin/env bash
# Builds the store / release zip from extension/ – nothing else goes in.
#
#   scripts/package.sh            → dist/xtend-<version>.zip
#   scripts/package.sh --no-tests → skip `node --test` (not for releases)
#
# The version comes from extension/manifest.json. Needs: bash, zip, node.

set -euo pipefail

cd "$(dirname "$0")/.."

if [[ "${1:-}" != "--no-tests" ]]; then
  echo "Running tests…"
  node --test >/dev/null || { echo "Tests failed – no zip built. Run 'node --test' to see why." >&2; exit 1; }
fi

version="$(node -p "require('./extension/manifest.json').version")"
if [[ ! "$version" =~ ^[0-9]+(\.[0-9]+){0,3}$ ]]; then
  echo "Invalid version in manifest.json: '$version'" >&2
  exit 1
fi

out="dist/xtend-${version}.zip"
mkdir -p dist
rm -f "$out"

# -X: no extra file attributes, so the zip only depends on the files' contents and names
(cd extension && zip -q -r -X "../$out" . -x '*.DS_Store' '__MACOSX/*' '*.swp' '*~')

if command -v shasum >/dev/null; then
  sum="$(shasum -a 256 "$out" | cut -d' ' -f1)"
else
  sum="$(sha256sum "$out" | cut -d' ' -f1)"
fi

echo "Built $out ($(wc -c <"$out" | tr -d ' ') bytes)"
echo "SHA-256 $sum"
