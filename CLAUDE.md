# CLAUDE.md

Rules for working on Xtend. Read this before changing anything.

## What this is

Xtend: Social Media Toolkit – a lightweight MV3 browser extension that adds small missing features to social media sites. Today it does one thing: on X, the Share menu's "Download video" item saves the post's video or GIF in the best quality. Other platforms (e.g. Instagram reels) may come later; build for what exists now, not for them.

## Hard rules

- **Plain JavaScript only.** No TypeScript, bundlers, transpilers, frameworks, `package.json` or `node_modules`. Files in `extension/` are loaded by the browser exactly as written.
- **No new dependencies**, in the extension, the tests or the scripts. Node built-ins and the Python standard library only.
- **Minimal permissions.** The manifest asks for `downloads` and nothing else: no `host_permissions`, no `tabs`, no `<all_urls>`. Adding a permission needs the owner's explicit approval (it slows store review and changes what users consent to).
- **No network calls of our own.** Video data comes only from X's own GraphQL responses that the page already fetches (`page/interceptor.js`). No syndication API, no legacy formats, no fetching X or anything else from the extension, no analytics, no remote code.
- **No visible UI beyond the Share menu item.** No extra buttons, toasts, popups or options page. Errors go to the console only when debug mode is on (`localStorage.xtendDebug = '1'`); nothing is logged otherwise.
- **The name is fixed:** "Xtend: Social Media Toolkit" (short name "Xtend"). Do not change it.
- **Never commit secrets or personal data.** `*.pem`, `*.crx`, `*.zip` and `dist/` stay git-ignored. Never print, paste or ask for the signing key. Strip the owner's handle, avatar and viewer-specific fields from any new fixture – the repo is public.

## Behaviour to keep

- Original post: our item takes over X's native "Download video" entry. Quote post: our item is added. Reposts are not supported (by decision, not by accident).
- `allow_download = false` still downloads; just log it in debug mode.
- GIFs are saved as `.mp4`, named `xtend_<tweetId>_<mediaId>_gif.mp4`; videos `xtend_<tweetId>_<mediaId>.mp4`.
- Only `https://video.twimg.com/` URLs are ever downloaded. The service worker validates the sender, the URL and the IDs; keep those checks.
- Must work in Chromium and WebKit-based browsers. The main test browser is [Search](https://github.com/driceroland/Search); also check Chrome.

## Code layout and style

- `extension/shared/` – code used in both worlds (`self.XtendVideoMedia`, also `module.exports` for Node tests).
- `extension/page/` – MAIN-world script only (the interceptor).
- `extension/content/` – isolated-world scripts. Each is an IIFE that adds to `self.Xtend`; load order is the manifest order and `content/main.js` stays last.
- `extension/background/` – the service worker (classic script, `self.XtendBackground` for tests).
- Selectors live in `content/selectors.js` only. X's markup has no `data-testid`; rely on roles, `aria-*`, `data-href` and the structure seen in `tests/fixtures/html/`.
- Small files with one job each. Follow `.editorconfig` (2 spaces, LF, final newline). Match the style of the file you're in.

## Tests

- Every change ships with tests, and both suites must pass before a PR:
  - `node --test` – logic tests (`tests/*.test.js`).
  - `tests/browser/run-headless.sh` – DOM tests (`tests/browser/*.dom.js`, named `.dom.js` so `node --test` skips them).
- Tests run only against the captures in `tests/fixtures/`. If X changes its markup or API, add a new capture (cleaned of personal data) and update `tests/fixtures/README.md`; don't invent markup.
- Check the result by the command's exit code, not by grepping its output.

## Git, PRs and releases

- Never push to `main`. One branch and one PR per change; the owner reviews and merges.
- Don't touch branches, stashes or PRs you didn't create; mention them instead.
- The version lives in `extension/manifest.json`. Release only with `scripts/push_new_release.sh` (tag `vX.Y.Z` must equal the manifest version). CI builds the reproducible zip, signs the `.crx`, attests both and publishes the GitHub release.
- Don't change `scripts/package.mjs` or `scripts/lib/zip.mjs` in a way that alters the output for the same input – people verify store copies against the published SHA-256 sums.

## Docs

Docs are part of the change, not a follow-up: update them in the same PR, and say in the PR description which ones you touched (or why none needed it). Check each of these:

- `README.md` – Usage, Troubleshooting (debug mode), Project layout (every added, moved or removed file), Tests, Release and Verify sections, and any command that changed.
- `PRIVACY.md` – anything about what the extension reads, stores, sends or downloads.
- `docs/store-listing.md` – the store description, permission justifications and data-usage answers. If these change, the Chrome Web Store dashboard has to be updated by hand too: say so in the PR.
- `extension/manifest.json` `description` – must still match what the extension does (max 132 characters).
- `tests/fixtures/README.md` – every capture and what it covers.
- `design/README.md` – how the icons are made, if they change.
- `CLAUDE.md` – when a rule or decision changes, update it here too.
