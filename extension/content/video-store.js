// MP4 links received from page/interceptor.js, indexed by media ID and tweet ID.
//
// The page world can't be trusted blindly (any script on x.com can postMessage),
// so every item is validated: digits-only IDs and an https://video.twimg.com/ URL.

(function () {
  'use strict';

  const Xtend = (self.Xtend = self.Xtend || {});

  const MAX_ITEMS = 5000; // oldest are dropped first, so long sessions don't grow forever
  const VIDEO_URL = /^https:\/\/video\.twimg\.com\//;
  const DIGITS = /^\d+$/;
  const KINDS = new Set(['video', 'gif']);

  /** @type {Map<string, object>} key → item, in insertion order (oldest first) */
  const items = new Map();
  /** @type {Map<string, object>} mediaId → item */
  const byMedia = new Map();
  /** @type {Map<string, object[]>} tweetId → items, in the order they were seen */
  const byTweet = new Map();

  function sanitize(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const { tweetId, mediaId, url, bitrate, kind, allowDownload } = raw;
    if (typeof tweetId !== 'string' || !DIGITS.test(tweetId)) return null;
    if (mediaId !== null && (typeof mediaId !== 'string' || !DIGITS.test(mediaId))) return null;
    if (typeof url !== 'string' || !VIDEO_URL.test(url)) return null;
    if (!KINDS.has(kind)) return null;
    return {
      tweetId,
      mediaId,
      url,
      bitrate: Number(bitrate) || 0,
      kind,
      allowDownload: typeof allowDownload === 'boolean' ? allowDownload : null,
    };
  }

  function evictOldest() {
    while (items.size > MAX_ITEMS) {
      const [key, old] = items.entries().next().value;
      items.delete(key);
      if (old.mediaId && byMedia.get(old.mediaId) === old) byMedia.delete(old.mediaId);
      const list = byTweet.get(old.tweetId);
      if (list) {
        const i = list.indexOf(old);
        if (i !== -1) list.splice(i, 1);
        if (!list.length) byTweet.delete(old.tweetId);
      }
    }
  }

  /**
   * Adds VideoItems; invalid ones are skipped, known ones only fill in a missing
   * allowDownload. Returns how many new videos were stored.
   */
  function add(list) {
    if (!Array.isArray(list)) return 0;
    let added = 0;
    for (const raw of list) {
      const item = sanitize(raw);
      if (!item) continue;
      const key = `${item.tweetId}:${item.mediaId || item.url}`;
      const existing = items.get(key);
      if (existing) {
        if (existing.allowDownload === null) existing.allowDownload = item.allowDownload;
        continue;
      }
      items.set(key, item);
      if (item.mediaId) byMedia.set(item.mediaId, item);
      const forTweet = byTweet.get(item.tweetId);
      if (forTweet) forTweet.push(item);
      else byTweet.set(item.tweetId, [item]);
      added++;
    }
    evictOldest();
    return added;
  }

  function debugEnabled() {
    try {
      return localStorage.getItem('xtendDebug') === '1';
    } catch (_) {
      return false;
    }
  }

  function onMessage(event) {
    if (event.source !== window || event.origin !== location.origin) return;
    const data = event.data;
    if (!data || data.source !== 'xtend' || data.type !== 'videos') return;
    const added = add(data.items);
    if (added && debugEnabled()) {
      console.debug(`[xtend] +${added} video(s), ${items.size} stored`);
    }
  }

  let listening = false;

  Xtend.videoStore = {
    /** Start receiving links from the interceptor (called once from main.js). */
    listen() {
      if (listening) return;
      listening = true;
      window.addEventListener('message', onMessage);
    },
    add,
    /** @returns {object|null} */
    byMediaId(mediaId) {
      return byMedia.get(mediaId) || null;
    },
    /** @returns {object[]} videos of a post, in the order X listed them */
    byTweetId(tweetId) {
      return (byTweet.get(tweetId) || []).slice();
    },
    get size() {
      return items.size;
    },
    MAX_ITEMS,
  };
})();
