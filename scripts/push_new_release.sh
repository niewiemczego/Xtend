#!/usr/bin/env bash
# Publishes a new Xtend release: asks for the version, checks everything, then pushes the
# annotated tag that starts the release workflow (build, sign, GitHub release).
#
#   scripts/push_new_release.sh
#
# Run it from an up-to-date clone on `main`. Needs git and node. Nothing is pushed until you
# confirm.

set -euo pipefail
cd "$(dirname "$0")/.."

red() { printf '\033[31m%s\033[0m\n' "$*"; }
green() { printf '\033[32m%s\033[0m\n' "$*"; }
bold() { printf '\033[1m%s\033[0m\n' "$*"; }
fail() { red "✗ $*" >&2; exit 1; }
ask_yes() { # ask_yes "Question" → 0 for y/yes, 1 otherwise (Enter = no)
  local answer
  read -r -p "$1 [y/N] " answer || true
  case "$answer" in y | Y | yes | YES | Yes) return 0 ;; *) return 1 ;; esac
}

command -v git >/dev/null || fail "git not found"
command -v node >/dev/null || fail "node not found"

# --- 1. Clean, up-to-date main ------------------------------------------------------------
branch="$(git rev-parse --abbrev-ref HEAD)"
[[ "$branch" == "main" ]] || fail "You are on '$branch'. Switch to main first: git switch main"
git diff --quiet && git diff --cached --quiet || fail "You have uncommitted changes. Commit or stash them first."

echo "Updating main…"
git pull --ff-only --quiet || fail "git pull failed – sort out main first."
git fetch --tags --quiet

manifest_version="$(node -p "require('./extension/manifest.json').version")"
latest_tag="$(git tag -l 'v*' | node -e '
  const tags = require("fs").readFileSync(0, "utf8").split("\n").filter((t) => /^v\d+(\.\d+){0,3}$/.test(t));
  const key = (t) => t.slice(1).split(".").map(Number);
  tags.sort((a, b) => { const x = key(a), y = key(b); for (let i = 0; i < 4; i++) { if ((x[i] || 0) !== (y[i] || 0)) return (x[i] || 0) - (y[i] || 0); } return 0; });
  process.stdout.write(tags.pop() || "");
')"

echo
bold "Xtend release"
echo "  manifest.json version: $manifest_version"
echo "  latest release tag:    ${latest_tag:-none}"
echo

# --- 2. Which version ------------------------------------------------------------------------
read -r -p "Version to release [$manifest_version]: " version || true
version="${version:-$manifest_version}"
version="${version#v}"
[[ "$version" =~ ^[0-9]+(\.[0-9]+){0,3}$ ]] || fail "'$version' is not a version like 0.1.1"
tag="v$version"

if git rev-parse -q --verify "refs/tags/$tag" >/dev/null || git ls-remote --exit-code --tags origin "refs/tags/$tag" >/dev/null 2>&1; then
  fail "$tag already exists. Pick a higher version."
fi

if [[ -n "$latest_tag" ]]; then
  newer="$(node -e '
    const [a, b] = process.argv.slice(1).map((v) => v.replace(/^v/, "").split(".").map(Number));
    for (let i = 0; i < 4; i++) { if ((a[i] || 0) !== (b[i] || 0)) { console.log((a[i] || 0) > (b[i] || 0) ? "yes" : "no"); process.exit(0); } }
    console.log("no");
  ' "$version" "$latest_tag")"
  [[ "$newer" == "yes" ]] || fail "$version is not higher than $latest_tag – the Chrome Web Store only accepts higher versions."
fi

# --- 3. manifest.json must say the same version ------------------------------------------------
if [[ "$version" != "$manifest_version" ]]; then
  echo
  echo "manifest.json says $manifest_version, the release would be $version."
  if ask_yes "Set manifest.json to $version, commit \"Release $version\" and push it to main?"; then
    node -e '
      const fs = require("fs");
      const file = "extension/manifest.json";
      const text = fs.readFileSync(file, "utf8");
      const next = text.replace(/("version"\s*:\s*")[^"]*(")/, `$1${process.argv[1]}$2`);
      if (next === text) { console.error("version field not found"); process.exit(1); }
      fs.writeFileSync(file, next);
    ' "$version"
    git add extension/manifest.json
    git commit --quiet -m "Release $version"
    git push --quiet origin main
    green "✓ manifest.json → $version (pushed to main)"
  else
    fail "Not released. Bump \"version\" in extension/manifest.json to $version (or enter $manifest_version) and run this again."
  fi
fi

# --- 4. Tests --------------------------------------------------------------------------------------
echo "Running tests…"
node --test >/dev/null 2>&1 || fail "Tests failed – run 'node --test' to see why. Nothing was released."
green "✓ tests pass"

# --- 5. Tag and push ---------------------------------------------------------------------------------
echo
bold "About to release Xtend $version"
echo "  tag:     $tag (annotated, \"Xtend $version\")"
echo "  commit:  $(git log -1 --format='%h %s')"
echo
ask_yes "Create the tag and push it? This starts the release." || fail "Cancelled – nothing was pushed."

git tag -a "$tag" -m "Xtend $version"
git push --quiet origin "$tag"

repo="$(git remote get-url origin | sed -E 's#(git@github\.com:|https://github\.com/)##; s#\.git$##')"
echo
green "✓ Pushed $tag – the release is building."
echo "  Progress: https://github.com/$repo/actions"
echo "  Release:  https://github.com/$repo/releases/tag/$tag  (in a few minutes)"
echo
echo "Then upload xtend-$version.crx from the release in the Chrome Web Store dashboard."
