# Contributing to Xtend

Thanks for helping. Xtend is plain JavaScript with no dependencies and no build step. The project rules – what the extension may and may not do, code style, tests, docs – are in [`CLAUDE.md`](CLAUDE.md). Please read it before opening a pull request.

## Getting started

1. Clone the repo.
2. Open `chrome://extensions` (Edge: `edge://extensions`) and turn on **Developer mode**.
3. **Load unpacked** → select the `extension/` folder.
4. After changing code, click ↻ on the extension card and refresh the x.com tab.

## Pull requests

- One branch and one PR per change. Nobody pushes to `main`; the owner reviews and merges.
- Every change ships with tests, and both test suites must pass.
- Update the docs in the same PR (see the *Docs* list in `CLAUDE.md`) and say in the PR which ones you touched.

## Project layout

```
extension/                   loaded in Chrome and zipped for release
  manifest.json
  shared/video-media.js      finds MP4 links in X's JSON
  shared/post-link.js        strips tracking parameters from a post link
  page/interceptor.js        reads X's API responses (MAIN world)
  page/link-cleaner.js       cleans links from Copy link / Share post via …
  content/                   isolated world, loaded in manifest order
    selectors.js             every selector for X's markup
    post.js                  post lookup: video, tweet IDs, media ID
    video-store.js           MP4 links from the interceptor
    video-resolver.js        video on screen → MP4 link
    debug.js                 [xtend] console logs
    download.js              post's videos → service worker
    share-menu.js            "Download video" in the Share menu
    main.js                  start-up and DOM observer (loaded last)
    content.css
  background/service-worker.js  saves files with chrome.downloads
  icons/                     PNGs generated from design/
design/                      icon sources (SVG)
  store/                     Chrome Web Store screenshots and promo tile
docs/store-listing.md        Chrome Web Store texts and privacy answers
scripts/package.mjs          reproducible release zip + checksums
scripts/lib/zip.mjs          the zip writer package.mjs uses
scripts/verify-store.mjs     compares a store / installed copy with a release
scripts/sign-crx.sh          signs a release zip as .crx
scripts/push_new_release.sh  tags and pushes a release
.github/workflows/           CI and releases
CLAUDE.md                    rules for contributors and coding agents
tests/                       *.test.js (Node), browser/ (DOM), helpers/, fixtures/
```

## Tests

Nothing to install. All tests use the captures in `tests/fixtures/`.

```sh
node --test                    # logic (Node 20+)
tests/browser/run-headless.sh  # DOM, headless Chrome
```

To run the DOM tests in a browser: `python3 -m http.server 8000` and open http://localhost:8000/tests/browser/.

## Release (maintainers)

From an up-to-date `main`:

```sh
scripts/push_new_release.sh
```

It asks for the version, checks the branch, tag and manifest, runs the tests and – after you confirm – pushes the tag `vX.Y.Z`. GitHub Actions then builds the zip, signs the `.crx`, adds [build attestations](https://docs.github.com/actions/security-for-github-actions/using-artifact-attestations) and publishes the GitHub release. The `.crx` goes to the Chrome Web Store.

- **Local build:** `node scripts/package.mjs` → `dist/xtend-<version>.zip` plus `.zip.sha256` and `.files.sha256`. The build is reproducible: the same files always give a byte-identical zip.
- **Signing key:** the repository secret `CWS_SIGNING_KEY` (PEM). To sign by hand: `scripts/sign-crx.sh <zip> <key.pem>`. Never keep the key in the repo; back it up offline – a lost key means going through store support.
- **Store texts:** [`docs/store-listing.md`](docs/store-listing.md); privacy policy: [`PRIVACY.md`](PRIVACY.md).
