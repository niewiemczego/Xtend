# Icon sources

The Xtend icon: four arrows pointing out to the corners form an X, inside a dashed frame
(concept F). Indigo `#4F46E5`, white mark.

| Source | Used for | Notes |
| --- | --- | --- |
| `icon.svg` | 48 px and the 128 px store icon | full detail |
| `icon-32.svg` | 32 px | heavier frame, fewer and longer dashes |
| `icon-16.svg` | 16 px (toolbar) | no frame; the X as two crossing lines with short arrowheads |

The PNGs in `extension/icons/` are generated from these. The 128 px icon has its artwork at
96 × 96 with 16 px of transparent padding, as the Chrome Web Store asks.

Regenerate (needs `rsvg-convert` from librsvg and ImageMagick):

```sh
rsvg-convert -w 16 -h 16 design/icon-16.svg -o extension/icons/icon-16.png
rsvg-convert -w 32 -h 32 design/icon-32.svg -o extension/icons/icon-32.png
rsvg-convert -w 48 -h 48 design/icon.svg    -o extension/icons/icon-48.png
rsvg-convert -w 96 -h 96 design/icon.svg    -o /tmp/icon-96.png
magick /tmp/icon-96.png -background none -gravity center -extent 128x128 extension/icons/icon-128.png
```

## Store graphics

`store/` keeps the Chrome Web Store graphics so they don't get lost – what each one is and
where it goes is listed in [`docs/store-listing.md`](../docs/store-listing.md#graphics).

| File | Size | What |
| --- | --- | --- |
| `store/screenshot-download-video.png` | 1280 × 800 | Share menu with **Download video** highlighted |
| `store/screenshot-clean-links.png` | 1280 × 800 | **Copy link** highlighted, link before / after cleaning |
| `store/promo-tile-small.png` | 157 × 100 | small promo tile preview (the store wants 440 × 280) |
