// Finding video, GIF and original-quality photo links in X's GraphQL JSON. Pure functions, no DOM.
//
// Loaded in three places:
//   - page world (manifest, before page/interceptor.js)  → self.XtendVideoMedia
//   - content world (manifest, before content/post.js)   → self.XtendVideoMedia
//   - Node tests (require)                                → module.exports
//
// Format (see tests/fixtures/README.md): a post is an object with `rest_id` and
// `media_entities2[]`; quoted posts are separate post objects nested inside.

/**
 * @typedef {Object} MediaItem
 * @property {string} tweetId        ID of the post the media belongs to (`rest_id`)
 * @property {string|null} mediaId   media ID (`id_str`, or the number in a video poster URL)
 * @property {string} url            best MP4 on video.twimg.com, or name=orig URL on pbs.twimg.com
 * @property {number} bitrate        bitrate of an MP4 (0 for GIFs and photos)
 * @property {'video'|'gif'|'photo'} kind
 * @property {boolean|null} allowDownload  author's "allow downloads" setting; null when X doesn't send it
 */

(function (root) {
  'use strict';

  const KIND_BY_TYPE = { video: 'video', animated_gif: 'gif' };
  const DIGITS = /^\d+$/;
  const IMAGE_FORMATS = new Set(['jpg', 'jpeg', 'png', 'webp', 'avif']);

  // Media ID in poster / video URLs:
  //   pbs.twimg.com/amplify_video_thumb/<id>/…   video.twimg.com/amplify_video/<id>/…
  //   pbs.twimg.com/ext_tw_video_thumb/<id>/…    video.twimg.com/ext_tw_video/<id>/…
  const MEDIA_ID_IN_URL = /\/(?:amplify_video|ext_tw_video)(?:_thumb)?\/(\d+)\//;

  // Photo path on pbs.twimg.com:
  //   /media/<key>.<ext>  (GraphQL media_url_https)
  //   /media/<key>        (DOM img src, with ?format=<ext>&name=<size>)
  const PHOTO_PATH = /^\/media\/([A-Za-z0-9_-]+)(?:\.([a-zA-Z0-9]+))?$/;

  /**
   * Highest-bitrate MP4 among a media's variants (the HLS playlist is ignored).
   * @param {Array<{content_type?: string, bitrate?: number, url?: string}>} variants
   * @returns {{url: string, bitrate: number} | null}
   */
  function bestMp4(variants) {
    if (!Array.isArray(variants)) return null;
    let best = null;
    for (const v of variants) {
      if (!v || v.content_type !== 'video/mp4' || typeof v.url !== 'string') continue;
      const bitrate = Number(v.bitrate) || 0;
      if (!best || bitrate > best.bitrate) best = { url: v.url, bitrate };
    }
    return best;
  }

  /** @returns {string|null} */
  function mediaIdFromUrl(url) {
    const m = typeof url === 'string' ? MEDIA_ID_IN_URL.exec(url) : null;
    return m ? m[1] : null;
  }

  /**
   * Photo key from a pbs.twimg.com/media/ URL (e.g. HX8nO9yW8AE_59M), or null.
   * Identical for GraphQL URLs (…/media/KEY.jpg) and DOM URLs (…/media/KEY?format=jpg&name=large).
   * @returns {string|null}
   */
  function photoKeyFromUrl(url) {
    if (typeof url !== 'string') return null;
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== 'https:' || parsed.hostname !== 'pbs.twimg.com') return null;
      const m = PHOTO_PATH.exec(parsed.pathname);
      return m ? m[1] : null;
    } catch (_) {
      return null;
    }
  }

  /**
   * Original-quality (name=orig) URL for a pbs.twimg.com/media/ photo, or null if not one.
   * @returns {string|null}
   */
  function photoOrigUrl(url) {
    if (typeof url !== 'string') return null;
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== 'https:' || parsed.hostname !== 'pbs.twimg.com') return null;
      const m = PHOTO_PATH.exec(parsed.pathname);
      if (!m) return null;
      const [, key, ext] = m;
      const rawFormat = (ext || parsed.searchParams.get('format') || '').toLowerCase();
      const out = new URL(`https://pbs.twimg.com/media/${key}`);
      if (IMAGE_FORMATS.has(rawFormat)) out.searchParams.set('format', rawFormat);
      out.searchParams.set('name', 'orig');
      return out.href;
    } catch (_) {
      return null;
    }
  }

  /**
   * One `media_entities2` item → MediaItem, or null for unsupported / incomplete media.
   * @returns {MediaItem|null}
   */
  function toMediaItem(tweetId, media) {
    if (!media || typeof media !== 'object') return null;
    const status = media.allow_download_status;
    const allowDownload =
      status && typeof status.allow_download === 'boolean' ? status.allow_download : null;

    if (media.type === 'photo') {
      const url = photoOrigUrl(media.media_url_https);
      if (!url) return null;
      return {
        tweetId,
        mediaId: typeof media.id_str === 'string' && DIGITS.test(media.id_str) ? media.id_str : null,
        url,
        bitrate: 0,
        kind: 'photo',
        allowDownload,
      };
    }

    const kind = KIND_BY_TYPE[media.type];
    if (!kind) return null;
    const best = bestMp4(media.video_info && media.video_info.variants);
    if (!best) return null;

    return {
      tweetId,
      // TweetDetail repeats the focal post without id_str → read it from the poster URL
      mediaId: media.id_str || mediaIdFromUrl(media.media_url_https) || mediaIdFromUrl(best.url),
      url: best.url,
      bitrate: best.bitrate,
      kind,
      allowDownload,
    };
  }

  /**
   * All videos, GIFs and photos in a GraphQL response (HomeTimeline, TweetDetail,
   * TweetResultByRestId …), each attributed to the post it belongs to – media in a
   * quoted post gets the quoted post's ID. The same item seen twice is returned once.
   * Never throws; anything unexpected yields an empty array.
   * @returns {MediaItem[]}
   */
  function extractFromGraphQL(json) {
    const items = [];
    const byKey = new Map();

    const add = (item) => {
      if (!item) return;
      const key =
        item.kind === 'photo'
          ? `${item.tweetId}:${photoKeyFromUrl(item.url) || item.url}`
          : `${item.tweetId}:${item.mediaId || item.url}`;
      const existing = byKey.get(key);
      if (!existing) {
        byKey.set(key, item);
        items.push(item);
      } else {
        if (existing.mediaId === null && item.mediaId) existing.mediaId = item.mediaId;
        if (existing.allowDownload === null) existing.allowDownload = item.allowDownload;
      }
    };

    // Iterative depth-first walk in document order
    const stack = [json];
    while (stack.length) {
      const node = stack.pop();
      if (!node || typeof node !== 'object') continue;
      if (Array.isArray(node)) {
        for (let i = node.length - 1; i >= 0; i--) stack.push(node[i]);
        continue;
      }
      if (typeof node.rest_id === 'string' && Array.isArray(node.media_entities2)) {
        for (const media of node.media_entities2) add(toMediaItem(node.rest_id, media));
      }
      const keys = Object.keys(node);
      for (let i = keys.length - 1; i >= 0; i--) {
        const v = node[keys[i]];
        if (v && typeof v === 'object') stack.push(v);
      }
    }
    return items;
  }

  const XtendVideoMedia = { bestMp4, mediaIdFromUrl, photoKeyFromUrl, photoOrigUrl, extractFromGraphQL };

  root.XtendVideoMedia = XtendVideoMedia;
  if (typeof module === 'object' && module.exports) module.exports = XtendVideoMedia;
})(typeof self !== 'undefined' ? self : globalThis);
