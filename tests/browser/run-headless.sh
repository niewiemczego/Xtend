#!/usr/bin/env bash
# Runs the DOM tests (tests/browser/) in headless Chrome – no dependencies, used by CI.
#
#   tests/browser/run-headless.sh
#
# Needs python3 (to serve the repo) and Chrome / Chromium. Set CHROME to the binary if it
# isn't found automatically.

set -euo pipefail
cd "$(dirname "$0")/../.."

chrome="${CHROME:-}"
if [[ -z "$chrome" ]]; then
  for candidate in google-chrome google-chrome-stable chromium chromium-browser \
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"; do
    if command -v "$candidate" >/dev/null 2>&1 || [[ -x "$candidate" ]]; then chrome="$candidate"; break; fi
  done
fi
[[ -n "$chrome" ]] || { echo "Chrome not found – set CHROME=/path/to/chrome" >&2; exit 2; }

port="${PORT:-8765}"
python3 -m http.server "$port" --bind 127.0.0.1 >/dev/null 2>&1 &
server=$!
profile="$(mktemp -d)"
trap 'kill $server 2>/dev/null || true; rm -rf "$profile"' EXIT

for _ in $(seq 1 50); do
  python3 - "$port" <<'PY' && break
import socket, sys
s = socket.socket()
try:
    s.connect(("127.0.0.1", int(sys.argv[1])))
except OSError:
    sys.exit(1)
PY
  sleep 0.1
done

# The runner writes "N passed, M failed" into #summary and one <li> per test.
dom="$("$chrome" --headless=new --no-sandbox --disable-gpu --no-first-run --user-data-dir="$profile" \
  --virtual-time-budget=30000 --dump-dom "http://127.0.0.1:$port/tests/browser/" 2>/dev/null)"

python3 - "$dom" <<'PY'
import html, re, sys
dom = sys.argv[1]
summary = re.search(r'<div id="summary"[^>]*>(.*?)</div>', dom, re.S)
summary = html.unescape(summary.group(1)).strip() if summary else ""
for item in re.finditer(r'<li class="(pass|fail)">(.*?)</li>', dom, re.S):
    text = re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", item.group(2)))).strip()
    print(("PASS " if item.group(1) == "pass" else "FAIL ") + text[2:300])
m = re.match(r"(\d+) passed, (\d+) failed", summary)
if not m:
    print(f"No result from the test page (summary: {summary!r})", file=sys.stderr)
    sys.exit(2)
print(summary)
sys.exit(0 if m.group(2) == "0" else 1)
PY
