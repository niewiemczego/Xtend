# Xtend

**Xtend: Social Media Toolkit** – a lightweight browser extension that adds the small features social media sites are missing. On X today:

- save any video or GIF in the best available quality from the Share menu (quoted posts too),
- share post links without tracking parameters.

No accounts, no tracking, no third-party servers. Not affiliated with X Corp. or any other platform.

## Install

**From a release:** download `xtend-<version>.zip` from the [latest release](https://github.com/niewiemczego/Xtend/releases/latest), unzip it, open `chrome://extensions` (Edge: `edge://extensions`), turn on **Developer mode** and **Load unpacked** the unzipped folder.

**From source:** clone the repo and **Load unpacked** the `extension/` folder the same way – see [`CONTRIBUTING.md`](CONTRIBUTING.md).

## Usage

- **Download video** – in a post's **Share** menu. Saves `xtend_<postId>_<mediaId>.mp4` (GIFs: `…_gif.mp4`) to your Downloads folder. On original posts Xtend takes over X's own item; on quote posts it adds one. Reposts show the original post, so they work the same way.
- **Copy link** / **Share post via …** – give a clean link, `https://x.com/<user>/status/<id>`, with nothing after the path. Other links and text are left alone.

Xtend shows nothing else on the page.

## Troubleshooting: debug mode

In the developer console on x.com (Chrome / Edge / Brave: `⌥⌘J` / `Ctrl+Shift+J`; Safari / Search: Web Inspector → *Console*):

```js
localStorage.xtendDebug = '1'            // turn on, then refresh the page
localStorage.removeItem('xtendDebug')    // turn off
```

Xtend's lines start with `[xtend]`: videos found, Share menu clicks, cleaned links, download requests and why they failed. Include them when you report a problem. The service worker logs to its own console (`chrome://extensions` → Xtend → *service worker*).

## Verify a release

Anyone can check that a release – and the Chrome Web Store copy – was built from this repo. Only Node is needed.

```sh
# 1. Rebuild from the tag and compare with the SHA-256 on the release page
git clone https://github.com/niewiemczego/Xtend && cd Xtend && git checkout v0.2.0
node scripts/package.mjs --no-tests && cat dist/xtend-0.2.0.zip.sha256

# 2. Check where the zip was built
gh attestation verify xtend-0.2.0.zip --repo niewiemczego/Xtend

# 3. Compare the store copy (installed folder or a .crx) file by file
node scripts/verify-store.mjs <folder or .crx> xtend-0.2.0.files.sha256
```

The store re-signs packages and adds `_metadata/`, so step 3 compares files, not the zip hash. It ignores `_metadata/` and the `update_url` / `key` manifest entries. The installed copy is in your browser profile under `Extensions/<id>/<version>/`.

## Privacy

Xtend collects nothing and sends nothing anywhere. It reads only what X already loads in your tab, keeps video addresses in memory until you close or reload it, and runs only on x.com and twitter.com. Details: [`PRIVACY.md`](PRIVACY.md).

## Contributing

Bug reports and pull requests are welcome – see [`CONTRIBUTING.md`](CONTRIBUTING.md). When you report a problem, include the `[xtend]` lines from debug mode.

## License

[MIT](LICENSE)
