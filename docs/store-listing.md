# Chrome Web Store listing

Copy-paste texts for the Chrome Web Store developer dashboard. Keep them in sync with
`extension/manifest.json` and `PRIVACY.md`.

## Store listing tab

**Name** (from the manifest)

```
Xtend: Social Media Toolkit
```

**Summary** (from the manifest, max 132 characters)

```
Small tools that social media sites are missing. Today, on X: save videos and GIFs in the best quality, share clean post links.
```

**Description**

```
Xtend adds the small tools that social media sites are missing – starting with saving videos and clean links.

SAVE VIDEOS AND GIFS FROM X
Open the Share menu of any post with a video or GIF and choose "Download video". Xtend saves it to your Downloads folder in the best quality available – the same file X plays, no re-encoding.

• Works on original posts and on quote posts (it saves the video of the quoted post)
• Always picks the highest-quality version
• GIFs are saved as MP4, exactly as X stores them
• Nothing added to the page: Xtend lives in the Share menu you already know

CLEAN POST LINKS
"Copy link" and "Share post via …" give the plain post address – x.com/<user>/status/<id> – without the tracking parameters X adds (?s=20, ?a=…). Everything else you copy is left alone.

PRIVATE BY DESIGN
• No accounts, no tracking, no analytics, no ads
• No servers: everything happens in your browser
• Only one permission: saving downloads

LIGHTWEIGHT
Plain JavaScript, no third-party libraries, about 40 KB.

MORE TO COME
Xtend is built to grow: more tools and more platforms are planned.

Works on X (x.com). Xtend is an independent project and is not affiliated with, endorsed by or sponsored by X Corp.

Source code and issue tracker: https://github.com/niewiemczego/Xtend
```

**Category**: pick *Productivity* or *Tools* from the dashboard's list.

**Language**: English.

### Graphics

| Asset | Size | File / to do |
| --- | --- | --- |
| Store icon | 128 × 128 | `extension/icons/icon-128.png` (96 px artwork + 16 px padding) |
| Screenshots (1–5) | 1280 × 800 or 640 × 400 | **to take in the browser**, see below |
| Small promo tile (optional) | 440 × 280 | – |

Screenshots to take (light theme, a public post, nothing personal in view – no own handle,
DMs or notifications):

1. The Share menu open on a video post with **Download video** highlighted
2. The saved file in the browser's downloads list / Finder, named `xtend_<postId>_<mediaId>.mp4`
3. A quote post's Share menu with **Download video**

## Privacy practices tab

**Single purpose**

```
Xtend adds small missing tools to social media sites. Currently, on X (x.com), it adds a "Download video" option to the Share menu that saves the post's video or GIF to the user's computer, and removes tracking parameters from the post links that menu copies or shares.
```

**Permission justification – `downloads`**

```
Used to save the video or GIF the user chose from the Share menu to the user's Downloads folder. Downloads start only when the user clicks "Download video".
```

**Host permission justification** (content scripts on `x.com`, `twitter.com`, `mobile.x.com`)

```
Xtend runs only on X. On these pages it adds "Download video" to the post's Share menu and reads the video addresses from the post data X already loads in the page, so it can save the selected video. When X copies or shares a post link from that menu, Xtend removes the tracking parameters from it. It does not run on any other site.
```

**Remote code**: No, I am not using remote code. (All code ships in the package; there are no `eval`, remote scripts or Wasm downloads.)

**Data usage** – check **Website content** only. Xtend reads the post data X loads on the page
(video links, post IDs) to find the video to save, and the post link X copies or shares, to
remove its tracking parameters. It stays in the page's memory and is never
sent anywhere, but the store asks for data handled locally too. Leave every other type
unchecked: no personal, health, financial or authentication data, no messages, no location,
no browsing history (only the current post's address is read), no tracking of clicks or keys.
Xtend never reads the clipboard; it only cleans the post link X itself is about to write.

Certify:

- [x] I do not sell or transfer user data to third parties, outside of the approved use cases
- [x] I do not use or transfer user data for purposes that are unrelated to my item's single purpose
- [x] I do not use or transfer user data to determine creditworthiness or for lending purposes

**Privacy policy URL**

```
https://github.com/niewiemczego/Xtend/blob/main/PRIVACY.md
```

## Package

```sh
node scripts/package.mjs   # runs the tests, then builds dist/xtend-<version>.zip from extension/
```

For a release, upload the `xtend-<version>.zip` attached to the GitHub release (built by
GitHub Actions from the tag) in the *Package* tab, so the store copy can be checked against it
(README → *Verify a release*). Bump `version` in `extension/manifest.json` before every new
upload – the store rejects a version it has seen.

## Verified CRX uploads

Turned on under *Package* → *Verified CRX Uploads* with the public key:

```sh
openssl genpkey -algorithm RSA -pkeyopt rsa_keygen_bits:2048 -out ~/xtend-signing-key.pem
openssl rsa -in ~/xtend-signing-key.pem -pubout   # paste this into the dashboard
```

After that, upload a signed `.crx` instead of the zip:
`scripts/sign-crx.sh <release zip> ~/xtend-signing-key.pem` → `dist/xtend-<version>.crx`.
Keep the private key out of the repository and out of your Google account (password manager +
offline backup).
