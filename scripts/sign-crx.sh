#!/usr/bin/env bash
# Signs a release zip as a .crx with your private key, for Chrome Web Store
# "Verified CRX uploads".
#
#   scripts/sign-crx.sh <xtend-<version>.zip> <private key .pem>
#   → dist/xtend-<version>.crx  (upload it with "Upload New Package")
#
# Use the zip from the GitHub release. If xtend-<version>.zip.sha256 and
# xtend-<version>.files.sha256 are next to it, the zip is checked before signing and the
# signed .crx is checked after, so the store gets exactly the released files.
#
# Never keep the key in this repository. Needs: bash, unzip, node, Chrome / Chromium
# (set CHROME=/path/to/chrome if it isn't found).

set -euo pipefail

zip="${1:-}"
key="${2:-}"
if [[ -z "$zip" || -z "$key" ]]; then
  echo "Usage: scripts/sign-crx.sh <xtend-<version>.zip> <private key .pem>" >&2
  exit 2
fi
[[ -f "$zip" ]] || { echo "No such zip: $zip" >&2; exit 2; }
[[ -f "$key" ]] || { echo "No such key: $key" >&2; exit 2; }

repo="$(cd "$(dirname "$0")/.." && pwd)"
key_abs="$(cd "$(dirname "$key")" && pwd)/$(basename "$key")"
case "$key_abs" in
  "$repo"/*) echo "Refusing: the key is inside the repository ($key_abs). Keep it outside." >&2; exit 2 ;;
esac

name="$(basename "$zip" .zip)" # xtend-<version>
dir="$(cd "$(dirname "$zip")" && pwd)"

# 1. The zip is the released one
if [[ -f "$dir/$name.zip.sha256" ]]; then
  (cd "$dir" && { sha256sum -c "$name.zip.sha256" 2>/dev/null || shasum -a 256 -c "$name.zip.sha256"; } >/dev/null) \
    || { echo "The zip does not match $name.zip.sha256 – not signing." >&2; exit 1; }
  echo "zip matches $name.zip.sha256"
else
  echo "note: $name.zip.sha256 not found next to the zip – skipping the zip check"
fi

# 2. Unpack into a folder named like the release (Chrome names the .crx after it)
chrome="${CHROME:-}"
if [[ -z "$chrome" ]]; then
  for candidate in "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
    "/Applications/Chromium.app/Contents/MacOS/Chromium" \
    google-chrome google-chrome-stable chromium chromium-browser; do
    if [[ -x "$candidate" ]] || command -v "$candidate" >/dev/null 2>&1; then chrome="$candidate"; break; fi
  done
fi
[[ -n "$chrome" ]] || { echo "Chrome not found – set CHROME=/path/to/chrome" >&2; exit 2; }

work="$(mktemp -d)"
trap 'rm -rf "$work"' EXIT
mkdir "$work/$name"
unzip -q "$zip" -d "$work/$name"

# 3. Sign
"$chrome" --headless=new --no-sandbox --no-message-box --user-data-dir="$work/profile" \
  --pack-extension="$work/$name" --pack-extension-key="$key_abs" >/dev/null 2>&1 || true
[[ -f "$work/$name.crx" ]] || { echo "Chrome did not create the .crx." >&2; exit 1; }

mkdir -p "$repo/dist"
out="$repo/dist/$name.crx"
mv "$work/$name.crx" "$out"

# 4. The signed .crx holds exactly the released files
if [[ -f "$dir/$name.files.sha256" ]]; then
  node "$repo/scripts/verify-store.mjs" "$out" "$dir/$name.files.sha256" >/dev/null \
    || { echo "The signed .crx does not match $name.files.sha256 – do not upload it." >&2; rm -f "$out"; exit 1; }
  echo "crx matches $name.files.sha256"
fi

echo "Signed: dist/$name.crx – upload it in the dashboard with \"Upload New Package\"."
