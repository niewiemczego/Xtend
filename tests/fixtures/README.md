# Fixtures

Markup and API responses captured from x.com, used by the tests.
See [#2](https://github.com/niewiemczego/Xtend/issues/2) for the list of files to collect.

- `html/` – `outerHTML` of posts and menus
- `api/` – raw GraphQL JSON responses

Record the capture date next to each file below – X changes its markup often.
Remove anything personal (own handle, avatar, DMs, tokens) before committing. In the status-page
captures the signed-in account (reply box avatar) is replaced with `me` / `profile_images/0/me`.

| File                                   | What it is                                                         | Captured   |
| -------------------------------------- | ------------------------------------------------------------------ | ---------- |
| `html/post-original-timeline.html`     | video post on the home timeline                                    | 2026-11-26 |
| `html/post-original-status.html`       | the same post on its status page                                   | 2026-11-26 |
| `html/post-original-timeline-gif.html` | GIF post on the timeline (`<video src>` is a direct MP4)           | 2026-11-26 |
| `html/post-original-status-gif.html`   | the same GIF on its status page                                    | 2026-11-26 |
| `html/post-quote.html`                 | quote post; the video is in the quoted post (nested `<article>`)   | 2026-11-26 |
| `html/post-video-from-other-post.html` | post showing a video that belongs to another post (`@user` badge)  | 2026-11-26 |
| `html/post-no-video.html`              | text-only post                                                     | 2026-11-26 |
| `html/post-no-video-with-image.html`   | post with an image, no video                                       | 2026-11-26 |
| `html/share-menu-original.html`        | open Share menu of an original video post (native *Download video*) | 2026-11-26 |
| `api/TweetDetail.json`                 | GraphQL `TweetDetail` of a video post with replies (videos + photos, quote) | 2026-11-26 |
| `api/TweetResultByRestId.json`         | GraphQL `TweetResultByRestId` of a single video post               | 2026-11-26 |

| `api/HomeTimeline.json`                | GraphQL `HomeTimeline`: 49 posts, 21 videos, 1 GIF, 11 quotes, no reposts | 2026-11-26 |

API files are pretty-printed for readable diffs. `HomeTimeline.json` has the signed-in viewer's
relationship fields removed (`relationship_perspectives`, `following`, `super_*`,
`follow_request_sent`) – they reveal who the viewer follows, blocks or mutes and the parser
doesn't need them.

## What the API looks like (2026-11-26)

- Media moved out of `legacy`: a post (`result` with `rest_id`) has `media_entities2[]`. `legacy` has no `id_str` and no `extended_entities` anymore.
- Each `media_entities2` item: `id_str` (= number in the poster URL), `type` (`video` / `animated_gif` / `photo`), `media_url_https` (poster), `video_info.variants[]` (`content_type`, `bitrate`, `url`; one HLS + several MP4) and `allow_download_status.allow_download`.
- Quoted posts: `quoted_tweet_results.result` (and `nested_quoted_tweet_results.result`) with the same shape.
- MP4 variant URLs carry a query string (`…/vid/avc1/710x524/<hash>.mp4?tag=29`); the resolution is in the path.

## What the markup looks like (2026-11-26)

- No `data-testid` attributes anymore (`videoPlayer`, `reply`, … are gone).
- Timeline post root: `div[role="link"][data-href="/<user>/status/<id>"]` → `<article>` inside. On the status page the root is just the `<article>`.
- Action bar: `div[role="group"]` with `[data-engagement-action="reply|retweet|like|bookmark|share"]`. The video player has its own `role="group"` (seek slider), so match the group by the `reply` button.
- Quoted post: nested `div[role="link"][data-href=…]` → `<article>` inside the outer `<article>`; its video sits there.
- Video poster carries the media ID: `amplify_video_thumb/<mediaId>/…` (also `ext_tw_video_thumb/<mediaId>/…`). GIFs use `tweet_video_thumb/<key>` and a direct `video.twimg.com/tweet_video/<key>.mp4` in `src`.
- Share menu: `div[role="menu"][aria-labelledby=<share button id>]`, items `div[role="menuitem"]`. On an original video post the order is: Send via Chat, Copy link, Share post via …, Post video, Download video.
