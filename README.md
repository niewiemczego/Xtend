# Xtend

Xtend is a lightweight browser extension that adds the features X is missing for free. Download any video or GIF in the best available quality with one click, right from the post's action bar or the Share menu – including reposts and quoted posts. No accounts, no tracking, no third-party servers. Not affiliated with X Corp.

> Status: work in progress – see the [v0.1 tracking issue](https://github.com/niewiemczego/Xtend/issues/15).

## Install (developer mode)

Plain JavaScript, no dependencies and no build step.

1. Clone the repo
2. Open `chrome://extensions` (Edge: `edge://extensions`) and turn on **Developer mode**
3. **Load unpacked** → select the `extension/` folder
4. After changing code, click ↻ on the extension card and refresh the x.com tab

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
    download-button.js     icon in the action bar
    share-menu.js          "Download video" in the Share menu
    main.js                start-up and DOM observer (loaded last)
    content.css
  background/
    service-worker.js      saves files with chrome.downloads
tests/
  *.test.js                node --test
  helpers/                 fake window for running extension scripts in Node
  browser/                 DOM tests (*.dom.js) – open in a browser
  fixtures/                HTML and JSON captured from x.com
```

## Tests

Nothing to install.

**Logic** (parser, interceptor, video store) – Node's built-in test runner (Node 20+):

```sh
node --test
```

**DOM** (selectors, post detection on the captured HTML) – a plain test page:

```sh
python3 -m http.server 8000
# open http://localhost:8000/tests/browser/ in Search, Safari or Chrome
```

Every test runs against the captures in `tests/fixtures/` – see its README for what each file is.

## License

[MIT](LICENSE)
