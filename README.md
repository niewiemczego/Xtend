# Xtend

**Xtend: Social Media Toolkit** – a lightweight browser extension that adds the small features social media sites are missing. On X today:

- **Save any video or GIF** in the best available quality, right from the post's Share menu – quoted posts included.
- **Share clean post links** – no `?s=20`, `?a=…` or other tracking parameters.

More platforms and tools to come. No accounts, no tracking, no third-party servers. Not affiliated with X Corp. or any other platform.

## Install

### From a release

1. Download `xtend-<version>.zip` from the [latest release](https://github.com/niewiemczego/Xtend/releases/latest) and unzip it.
2. Open `chrome://extensions` (Edge: `edge://extensions`) and turn on **Developer mode**.
3. Click **Load unpacked** and select the unzipped folder.

Want to be sure the zip is really built from this code? See [Verify a release](#verify-a-release).

### From source

Clone the repo and load the `extension/` folder the same way. There is no build step – see [`CONTRIBUTING.md`](CONTRIBUTING.md).

## Usage

### Download a video or GIF

Open the **Share** menu of a post with a video or GIF and choose **Download video**. The file goes to your Downloads folder in the best quality X offers:

- videos: `xtend_<postId>_<mediaId>.mp4`
- GIFs: `xtend_<postId>_<mediaId>_gif.mp4` – X serves GIFs as MP4 videos, so that's what you get.

Where the item appears:

- **Original posts** – X's own *Download video* item now saves the file through Xtend.
- **Quote posts** – if the quoted post has a video, Xtend adds the *Download video* item.
- **Reposts** – a repost shows the original post, so its Share menu works exactly like the original's.

### Clean post links

**Copy link** and **Share post via …** in the Share menu give you a clean link:

```
https://x.com/<user>/status/<id>?s=20   →   https://x.com/<user>/status/<id>
```

Only text that is nothing but a post link is changed. Other links and text are passed on as they are. Xtend never reads your clipboard. It only cleans the link X is about to put there.

Xtend adds nothing else to the page: no buttons, popups or settings.

## Troubleshooting: debug mode

If a download doesn't start or a link isn't cleaned, debug mode shows what Xtend is doing.

1. Open x.com and the browser's developer console:
   - Chrome / Edge / Brave: `⌥⌘J` on macOS, `Ctrl+Shift+J` on Windows/Linux
   - Safari and other WebKit browsers: Web Inspector → *Console*
2. Run:
   ```js
   localStorage.xtendDebug = '1'
   ```
3. Refresh the page and try again.

Every Xtend line in the console starts with `[xtend]`, for example:

- videos found while you scroll – `+3 video(s), 12 stored`
- each cleaned link – `cleaned link: <before> → <after>`
- the download request and its result, or why it failed – e.g. *X hasn't sent this video yet…* or *the browser did not start the download*

The extension's background part logs in its own console (`chrome://extensions` → Xtend → *service worker*), but only for downloads started while debug mode is on.

When you [report a problem](https://github.com/niewiemczego/Xtend/issues), please include these lines.

To turn debug mode off:

```js
localStorage.removeItem('xtendDebug')
```

## Privacy

Xtend collects nothing and sends nothing anywhere. It has no servers.

- It reads only what X already loads in your tab, to find each video's file address.
- It keeps those addresses in memory only, until you close or reload the tab.
- It runs only on x.com and twitter.com. Its one browser permission is `downloads`, to save the file you chose.

The full policy is in [`PRIVACY.md`](PRIVACY.md).

## Verify a release

Anyone can check that a release – and the copy in the Chrome Web Store – is built from this repository. Only Node is needed (and the GitHub CLI for step 2).

1. **Rebuild it from the tag** and compare the SHA-256 with the one on the release page. The build is reproducible, so the same code always gives a byte-identical zip.
   ```sh
   git clone https://github.com/niewiemczego/Xtend && cd Xtend
   git checkout v0.2.0
   node scripts/package.mjs --no-tests
   cat dist/xtend-0.2.0.zip.sha256
   ```
2. **Check where the release zip was built.** Every release has a GitHub build attestation that proves it came from this repo's release workflow:
   ```sh
   gh attestation verify xtend-0.2.0.zip --repo niewiemczego/Xtend
   ```
3. **Compare the Chrome Web Store copy.** The store re-signs every package and adds a `_metadata/` folder, so its file never has the zip's SHA-256 – but every file inside must be identical. Point the checker at the installed extension folder or at a downloaded `.crx`:
   ```sh
   node scripts/verify-store.mjs <installed folder or .crx> xtend-0.2.0.files.sha256
   ```
   To find the installed folder: `chrome://extensions` → turn on Developer mode → note Xtend's ID. The folder is `Extensions/<id>/<version>/` in your browser profile.

   `OK – all N files match the release` means the store serves exactly the released code. The checker ignores `_metadata/` and the `update_url` / `key` entries the store or browser may add to `manifest.json`, and says when that happened. Run it from a checkout of the same tag.

## Contributing

Bug reports and pull requests are welcome. Setup, project layout, tests and the release process are in [`CONTRIBUTING.md`](CONTRIBUTING.md).

## License

[MIT](LICENSE)
