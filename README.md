# Xtend

**Xtend: Social Media Toolkit** – a lightweight browser extension that adds the small features social media sites are missing. On X today:

- save any video or GIF in the best available quality from the Share menu (quoted posts too),
- share post links without tracking parameters.

No accounts, no tracking, no third-party servers. Not affiliated with X Corp. or any other platform.

> Status: work in progress – see the [v0.1 tracking issue](https://github.com/niewiemczego/Xtend/issues/15).

## Install (developer mode)

Plain JavaScript – no dependencies, no build step.

1. Clone the repo.
2. Open `chrome://extensions` (Edge: `edge://extensions`) and turn on **Developer mode**.
3. **Load unpacked** → select the `extension/` folder.
4. After changing code, click ↻ on the extension card and refresh the x.com tab.

## Usage

- **Download video** – in a post's **Share** menu. Saves `xtend_<postId>_<mediaId>.mp4` to your Downloads folder. On original posts Xtend takes over X's own item; on quote posts it adds one.
- **Copy link** / **Share post via …** – give a clean link, `https://x.com/<user>/status/<id>`, with nothing after the path. Other links and text are left alone.

Xtend shows nothing else on the page.

## Troubleshooting: debug mode

In the developer console on x.com (Chrome / Edge / Brave: `⌥⌘J` / `Ctrl+Shift+J`; Safari / Search: Web Inspector → *Console*):

```js
localStorage.xtendDebug = '1'            // turn on, then refresh the page
localStorage.removeItem('xtendDebug')    // turn off
```

Xtend's lines start with `[xtend]`: videos found, Share menu clicks, cleaned links, download requests and why they failed. Include them when you report a problem. The service worker logs to its own console (`chrome://extensions` → Xtend → *service worker*).

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
docs/store-listing.md        Chrome Web Store texts and privacy answers
scripts/package.mjs          reproducible release zip + checksums
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

## Release

From an up-to-date `main`:

```sh
scripts/push_new_release.sh
```

It asks for the version, checks the branch, tag and manifest, runs the tests and – after you confirm – pushes the tag `vX.Y.Z`. GitHub Actions then builds the zip, signs the `.crx`, adds [build attestations](https://docs.github.com/actions/security-for-github-actions/using-artifact-attestations) and publishes the GitHub release. The `.crx` goes to the Chrome Web Store.

- **Local build:** `node scripts/package.mjs` → `dist/xtend-<version>.zip` plus `.zip.sha256` and `.files.sha256`. The build is reproducible: the same files always give a byte-identical zip.
- **Signing key:** the repository secret `CWS_SIGNING_KEY` (PEM). To sign by hand: `scripts/sign-crx.sh <zip> <key.pem>`. Never keep the key in the repo; back it up offline – a lost key means going through store support.
- **Store texts:** [`docs/store-listing.md`](docs/store-listing.md); privacy policy: [`PRIVACY.md`](PRIVACY.md).

## Verify a release

Anyone can check that a release – and the Chrome Web Store copy – was built from this repo. Only Node is needed.

```sh
# 1. Rebuild from the tag and compare with the SHA-256 on the release page
git clone https://github.com/niewiemczego/Xtend && cd Xtend && git checkout v0.1.0
node scripts/package.mjs --no-tests && cat dist/xtend-0.1.0.zip.sha256

# 2. Check where the zip was built
gh attestation verify xtend-0.1.0.zip --repo niewiemczego/Xtend

# 3. Compare the store copy (installed folder or a .crx) file by file
node scripts/verify-store.mjs <folder or .crx> xtend-0.1.0.files.sha256
```

The store re-signs packages and adds `_metadata/`, so step 3 compares files, not the zip hash. It ignores `_metadata/` and the `update_url` / `key` manifest entries. The installed copy is in your browser profile under `Extensions/<id>/<version>/`.

## License

[MIT](LICENSE)
