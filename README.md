# Xtend

**Xtend: Social Media Toolkit** – a lightweight browser extension that adds the small features social media sites are missing. Today: save any video or GIF from X in the best available quality, right from the Share menu – including quoted posts. More platforms and tools to come. No accounts, no tracking, no third-party servers. Not affiliated with X Corp. or any other platform.

> Status: work in progress – see the [v0.1 tracking issue](https://github.com/niewiemczego/Xtend/issues/15).

## Install (developer mode)

Plain JavaScript, no dependencies and no build step.

1. Clone the repo
2. Open `chrome://extensions` (Edge: `edge://extensions`) and turn on **Developer mode**
3. **Load unpacked** → select the `extension/` folder
4. After changing code, click ↻ on the extension card and refresh the x.com tab

## Usage

Open the **Share** menu of a post with a video or GIF and choose **Download video**. The file is saved to your Downloads folder as `xtend_<postId>_<mediaId>.mp4` in the best available quality.

- On original posts this is X's own *Download video* item – Xtend takes it over.
- On quote posts whose quoted post has a video, Xtend adds the item.

Xtend shows nothing on the page. If a download doesn't happen, turn on debug mode (below).

## Troubleshooting: debug mode

1. Open x.com and the browser's developer console (Chrome / Edge / Brave: `⌥⌘J` on macOS, `Ctrl+Shift+J` on Windows/Linux; WebKit browsers such as Search or Safari: Web Inspector → *Console*).
2. Run:
   ```js
   localStorage.xtendDebug = '1'
   ```
3. Refresh the page and try the download again.

Every Xtend line in the console starts with `[xtend]`: videos found while you scroll (`+3 video(s), 12 stored`), the Share menu click, the download request and its result – or the reason it failed (e.g. *X hasn't sent this video yet…*, *the browser did not start the download*). Include these lines when you report a problem.

The service worker logs the same way in its own console (`chrome://extensions` → Xtend → *service worker*), but only for downloads started while debug mode is on.

Turn it off again with:

```js
localStorage.removeItem('xtendDebug')
```

## Project layout

```
extension/                 the folder you load in Chrome and zip for release
  manifest.json
  shared/
    video-media.js         finds MP4 links in X's JSON (page world + service worker + tests)
  page/
    interceptor.js         reads X's API responses (fetch + XHR), MAIN world
  content/                 loaded in the order listed in the manifest, sharing `self.Xtend`
    selectors.js           every selector for X's markup
    post.js                post lookup: has video, tweet IDs, media ID
    video-store.js         MP4 links received from the interceptor
    video-resolver.js      video on screen → MP4 link
    debug.js               [xtend] console logs, only in debug mode
    download.js            resolve a post's videos → service worker
    share-menu.js          "Download video" in the Share menu
    main.js                start-up and DOM observer (loaded last)
    content.css
  background/
    service-worker.js      saves files with chrome.downloads
  icons/                   16 / 32 / 48 / 128 px PNGs (generated from design/)
design/                    icon sources (SVG) – see design/README.md
docs/store-listing.md      Chrome Web Store texts and privacy answers
scripts/package.mjs        reproducible release zip + checksums
scripts/verify-store.mjs   compares a store / installed copy with a release
.github/workflows/         CI (tests, build) and tagged releases
tests/
  *.test.js                node --test
  helpers/                 fake window for running extension scripts in Node
  browser/                 DOM tests (*.dom.js) – open in a browser
  fixtures/                HTML and JSON captured from x.com
```

## Tests

Nothing to install.

**Logic** (parser, interceptor, video store, service worker, packaging) – Node's built-in test runner (Node 20+):

```sh
node --test
```

**DOM** (selectors, post detection on the captured HTML) – a plain test page:

```sh
python3 -m http.server 8000
# open http://localhost:8000/tests/browser/ in Search, Safari or Chrome
# or headless, as CI does:
tests/browser/run-headless.sh
```

Every test runs against the captures in `tests/fixtures/` – see its README for what each file is.

## Release

```sh
node scripts/package.mjs   # runs the tests, then builds dist/xtend-<version>.zip from extension/
```

The build is **reproducible**: entries are sorted, stored uncompressed, dated 1980-01-01 and
marked 0644, so the same files always give a byte-identical zip. Next to the zip it writes
`xtend-<version>.zip.sha256` and `xtend-<version>.files.sha256` (one line per file inside).

To publish, bump `version` in `extension/manifest.json`, merge, then push a matching tag:

```sh
git tag v0.1.0 && git push origin v0.1.0
```

GitHub Actions (`.github/workflows/release.yml`) runs all tests, builds the zip, signs a
[build provenance](https://docs.github.com/actions/security-for-github-actions/using-artifact-attestations)
attestation and creates the GitHub release with the zip and both checksum files. The same zip
goes to the Chrome Web Store. Store texts, permission justifications and the screenshot list
are in [`docs/store-listing.md`](docs/store-listing.md); the privacy policy is
[`PRIVACY.md`](PRIVACY.md).

Every push and pull request runs `.github/workflows/ci.yml`: unit tests, DOM tests in headless
Chrome, the package build, a reproducibility check and the checksum check.

## Verify a release

Anyone can check that a release – and the copy in the Chrome Web Store – is built from this
repository. Only Node is needed.

1. **Rebuild it** from the tag and compare the SHA-256 with the release page:
   ```sh
   git clone https://github.com/niewiemczego/Xtend && cd Xtend
   git checkout v0.1.0
   node scripts/package.mjs --no-tests
   cat dist/xtend-0.1.0.zip.sha256
   ```
2. **Check where the release zip was built** (GitHub CLI):
   ```sh
   gh attestation verify xtend-0.1.0.zip --repo niewiemczego/Xtend
   ```
3. **Compare the Chrome Web Store copy.** The store re-signs every package and adds a
   `_metadata/` folder, so its file never has the zip's SHA-256 – but every file inside must be
   identical. Point the checker at the installed extension folder (Chrome:
   `chrome://extensions` → Developer mode → the extension's ID; the folder is in your profile's
   `Extensions/<id>/<version>/`) or at a downloaded `.crx`:
   ```sh
   node scripts/verify-store.mjs <installed folder or .crx> xtend-0.1.0.files.sha256
   ```
   `OK – all N files match the release` means the store serves exactly the released code.
   `_metadata/` is ignored, and so are the `update_url` / `key` entries the store or browser may
   add to `manifest.json` (the output says when that happened). Run it from a checkout of the
   same tag.

## License

[MIT](LICENSE)
