# Contributing to Xtend

Thanks for helping. Xtend is plain JavaScript with no dependencies and no build step. The project rules are in [`CLAUDE.md`](CLAUDE.md): what the extension may and may not do (permissions, network, UI), code style, tests and docs. Please read it before opening a pull request.

## Getting started

1. Clone the repo.
2. Open `chrome://extensions` (Edge: `edge://extensions`) and turn on **Developer mode**.
3. Click **Load unpacked** and select the `extension/` folder.
4. After changing code, click ↻ on the extension card and refresh the x.com tab.

To see what the extension is doing while you work, turn on debug mode (see *Troubleshooting* in the [README](README.md#troubleshooting-debug-mode)).

## Pull requests

- One branch and one PR per change. Nobody pushes to `main`; the owner reviews and merges.
- Every change ships with tests, and both test suites (below) must pass.
- Update the docs in the same PR (see the *Docs* list in `CLAUDE.md`), and say in the PR description which ones you touched – or why none needed it.
- If X changes its markup or API, add a new capture to `tests/fixtures/` instead of inventing markup. Clean personal data out of it first, because the repo is public.

## Project layout

```
extension/                 the folder you load in Chrome and zip for release
  manifest.json
  shared/                  pure code used by more than one context
    video-media.js         finds video, GIF and photo links in X's JSON (page world + content + tests)
    post-link.js           strips tracking parameters from a post link (page world + tests)
  page/                    MAIN world
    interceptor.js         reads X's API responses (fetch + XHR)
    link-cleaner.js        cleans the link Copy link / Share post via … hand out
  content/                 loaded in the order listed in the manifest, sharing `self.Xtend`
    selectors.js           every selector for X's markup
    post.js                post lookup: videos, photos, tweet IDs, media ID
    video-store.js         media links received from the interceptor
    video-resolver.js      video or photo on screen → download URL
    debug.js               [xtend] console logs, only in debug mode
    download.js            resolve a post's media → service worker
    share-menu.js          "Download video" and "Download photo(s)" in the Share menu
    main.js                start-up and DOM observer (loaded last)
    content.css
  background/
    service-worker.js      saves files with chrome.downloads
  icons/                   16 / 32 / 48 / 128 px PNGs (generated from design/)
design/                    icon sources (SVG) – see design/README.md
  store/                   Chrome Web Store screenshots and promo tile
docs/store-listing.md      Chrome Web Store texts and privacy answers
scripts/package.mjs        reproducible release zip + checksums
scripts/lib/zip.mjs        the zip writer package.mjs uses
scripts/verify-store.mjs   compares a store / installed copy with a release
scripts/sign-crx.sh        signs a release zip as .crx for verified uploads
scripts/push_new_release.sh  asks for the version and pushes the release tag
.github/workflows/         CI (tests, build) and tagged releases
CLAUDE.md                  project rules for contributors and coding agents
tests/
  *.test.js                node --test
  helpers/                 fake window for running extension scripts in Node
  browser/                 DOM tests (*.dom.js) – open in a browser
  fixtures/                HTML, JSON and share calls captured from x.com
```

## Tests

Nothing to install. Every test runs against the captures in `tests/fixtures/` – see [its README](tests/fixtures/README.md) for what each file is.

**Logic** (parser, interceptor, link cleaning, video store, service worker, packaging) – Node's built-in test runner, Node 20+:

```sh
node --test
```

**DOM** (selectors, post detection on the captured HTML) – a plain test page:

```sh
tests/browser/run-headless.sh      # headless Chrome, as CI runs it
```

Or open the tests in a browser yourself:

```sh
python3 -m http.server 8000
# open http://localhost:8000/tests/browser/ in Search, Safari or Chrome
```

The DOM test files are named `*.dom.js` so that `node --test` skips them.

Every push and pull request runs `.github/workflows/ci.yml`: unit tests, DOM tests in headless Chrome, the package build, a reproducibility check and the checksum check.

## Release (maintainers)

The version lives in `extension/manifest.json`. To publish, run the release script from an up-to-date `main`:

```sh
scripts/push_new_release.sh
```

It:

1. asks for the version (Enter = the one in `extension/manifest.json`),
2. checks that you are on a clean `main`, that the tag doesn't exist yet and that the version is higher than the last release (the store only accepts higher versions),
3. offers to bump `manifest.json` and push that commit if the versions differ,
4. runs the tests and shows what it will tag,
5. only after you confirm, pushes an **annotated** tag `vX.Y.Z` ("Xtend X.Y.Z"), which starts the release workflow.

By hand it is:

```sh
git pull
git tag -a vX.Y.Z -m "Xtend X.Y.Z"
git push origin vX.Y.Z
```

The release is titled "Xtend X.Y.Z", and its run in the Actions tab "Xtend vX.Y.Z".

GitHub Actions (`.github/workflows/release.yml`) then:

- runs all tests and builds the zip,
- signs the `.crx` with the store key (below),
- adds [build provenance](https://docs.github.com/actions/security-for-github-actions/using-artifact-attestations) attestations for both,
- creates the GitHub release with the zip, the `.crx` and both checksum files.

The `.crx` goes to the Chrome Web Store. Store texts, permission justifications and the screenshot list are in [`docs/store-listing.md`](docs/store-listing.md). The privacy policy is [`PRIVACY.md`](PRIVACY.md).

### Building locally

```sh
node scripts/package.mjs   # runs the tests, then builds dist/xtend-<version>.zip from extension/
```

The build is **reproducible**: entries are sorted, stored uncompressed, dated 1980-01-01 and marked 0644, so the same files always give a byte-identical zip. Next to the zip it writes `xtend-<version>.zip.sha256` and `xtend-<version>.files.sha256` (one line per file inside). Users rely on this to verify releases. Don't change `scripts/package.mjs` or `scripts/lib/zip.mjs` in a way that alters the output for the same input.

### Signed uploads (Chrome Web Store "Verified CRX uploads")

Releases are signed in CI. The private key is the repository secret **`CWS_SIGNING_KEY`**: the PEM text, added under *Settings → Secrets and variables → Actions → New repository secret*, or with `gh secret set CWS_SIGNING_KEY < ~/.xtend/signing-key.pem`. The release workflow:

- writes the key to the runner's temp folder only while signing,
- deletes it right after,
- refuses to release without it.

Each release then has `xtend-<version>.crx`. It holds the release zip's files, signed with that key and checked against `xtend-<version>.files.sha256`, and it is the file that goes to the store.

To sign by hand instead (e.g. before the secret is set):

```sh
scripts/sign-crx.sh ~/Downloads/xtend-0.2.0.zip ~/.xtend/signing-key.pem
# → dist/xtend-0.2.0.crx – upload it with "Upload New Package"
```

The script refuses a key stored inside the repository, and `*.pem` and `*.crx` are git-ignored. Keep the key in a password manager with an offline backup – replacing a lost key goes through store support.
