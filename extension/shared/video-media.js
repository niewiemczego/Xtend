// Finding MP4 links in X's GraphQL JSON. Pure functions, no DOM.
//
// Loaded in three places:
//   - page world (manifest, before page/interceptor.js)  → self.XtendVideoMedia
//   - service worker (importScripts)                      → self.XtendVideoMedia
//   - Node tests (require)                                → module.exports
//
// Format (see tests/fixtures/README.md): a post is an object with `rest_id` and
// `media_entities2[]`; quoted posts are separate post objects nested inside.

/**
 * @typedef {Object} VideoItem
 * @property {string} tweetId        ID of the post the video belongs to (`rest_id`)
 * @property {string|null} mediaId   media ID – the number in the poster URL
 * @property {string} url            highest-quality MP4 on video.twimg.com
 * @property {number} bitrate        bitrate of that MP4 (0 for GIFs)
 * @property {'video'|'gif'} kind
 * @property {boolean|null} allowDownload  author's "allow downloads" setting; null when X doesn't send it
 */

(function (root) {
  'use strict';

  const KIND_BY_TYPE = { video: 'video', animated_gif: 'gif' };

  // Media ID in poster / video URLs:
  //   pbs.twimg.com/amplify_video_thumb/<id>/…   video.twimg.com/amplify_video/<id>/…
  //   pbs.twimg.com/ext_tw_video_thumb/<id>/…    video.twimg.com/ext_tw_video/<id>/…
  const MEDIA_ID_IN_URL = /\/(?:amplify_video|ext_tw_video)(?:_thumb)?\/(\d+)\//;

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
   * One `media_entities2` item → VideoItem, or null for photos / no MP4.
   * @returns {VideoItem|null}
   */
  function toVideoItem(tweetId, media) {
    if (!media || typeof media !== 'object') return null;
    const kind = KIND_BY_TYPE[media.type];
    if (!kind) return null;
    const best = bestMp4(media.video_info && media.video_info.variants);
    if (!best) return null;

    const status = media.allow_download_status;
    return {
      tweetId,
      // TweetDetail repeats the focal post without id_str → read it from the poster URL
      mediaId: media.id_str || mediaIdFromUrl(media.media_url_https) || mediaIdFromUrl(best.url),
      url: best.url,
      bitrate: best.bitrate,
      kind,
      allowDownload:
        status && typeof status.allow_download === 'boolean' ? status.allow_download : null,
    };
  }

  /**
   * All videos and GIFs in a GraphQL response (HomeTimeline, TweetDetail,
   * TweetResultByRestId …), each attributed to the post it belongs to – a video in a
   * quoted post gets the quoted post's ID. The same video seen twice is returned once.
   * Never throws; anything unexpected yields an empty array.
   * @returns {VideoItem[]}
   */
  function extractFromGraphQL(json) {
    const items = [];
    const byKey = new Map();

    const add = (item) => {
      if (!item) return;
      const key = `${item.tweetId}:${item.mediaId || item.url}`;
      const existing = byKey.get(key);
      if (!existing) {
        byKey.set(key, item);
        items.push(item);
      } else if (existing.allowDownload === null) {
        existing.allowDownload = item.allowDownload;
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
        for (const media of node.media_entities2) add(toVideoItem(node.rest_id, media));
      }
      const keys = Object.keys(node);
      for (let i = keys.length - 1; i >= 0; i--) {
        const v = node[keys[i]];
        if (v && typeof v === 'object') stack.push(v);
      }
    }
    return items;
  }

  const XtendVideoMedia = { bestMp4, mediaIdFromUrl, extractFromGraphQL };

  root.XtendVideoMedia = XtendVideoMedia;
  if (typeof module === 'object' && module.exports) module.exports = XtendVideoMedia;
})(typeof self !== 'undefined' ? self : globalThis);
