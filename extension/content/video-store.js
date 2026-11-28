// Media links (videos, GIFs, photos) received from page/interceptor.js, indexed by media ID,
// photo key and tweet ID.
//
// The page world can't be trusted blindly (any script on x.com can postMessage),
// so every item is validated: digits-only IDs and an https://video.twimg.com/ (video/GIF)
// or https://pbs.twimg.com/media/ (photo) URL.

(function () {
  'use strict';

  const Xtend = (self.Xtend = self.Xtend || {});

  const MAX_ITEMS = 5000; // oldest are dropped first, so long sessions don't grow forever
  const DIGITS = /^\d+$/;
  const KINDS = new Set(['video', 'gif', 'photo']);
  const PHOTO_PATH = /^\/media\/([A-Za-z0-9_-]+)(?:\.[a-zA-Z0-9]+)?$/;

  /** @type {Map<string, object>} key → item, in insertion order (oldest first) */
  const items = new Map();
  /** @type {Map<string, object>} mediaId → item */
  const byMedia = new Map();
  /** @type {Map<string, object>} photo key (e.g. HX8nO9yW8AE_59M) → item */
  const byPhoto = new Map();
  /** @type {Map<string, object[]>} tweetId → items, in the order they were seen */
  const byTweet = new Map();

  function photoKeyOf(url) {
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

  function isValidUrl(kind, url) {
    if (typeof url !== 'string') return false;
    if (kind === 'photo') return photoKeyOf(url) !== null;
    try {
      const parsed = new URL(url);
      return parsed.protocol === 'https:' && parsed.hostname === 'video.twimg.com';
    } catch (_) {
      return false;
    }
  }

  function sanitize(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const { tweetId, mediaId, url, bitrate, kind, allowDownload } = raw;
    if (typeof tweetId !== 'string' || !DIGITS.test(tweetId)) return null;
    if (mediaId !== null && (typeof mediaId !== 'string' || !DIGITS.test(mediaId))) return null;
    if (!KINDS.has(kind)) return null;
    if (!isValidUrl(kind, url)) return null;
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
      const pKey = old.kind === 'photo' ? photoKeyOf(old.url) : null;
      if (pKey && byPhoto.get(pKey) === old) byPhoto.delete(pKey);
      const list = byTweet.get(old.tweetId);
      if (list) {
        const i = list.indexOf(old);
        if (i !== -1) list.splice(i, 1);
        if (!list.length) byTweet.delete(old.tweetId);
      }
    }
  }

  /**
   * Adds MediaItems; invalid ones are skipped, known ones only fill in a missing
   * mediaId / allowDownload. Returns how many new items were stored.
   */
  function add(list) {
    if (!Array.isArray(list)) return 0;
    let added = 0;
    for (const raw of list) {
      const item = sanitize(raw);
      if (!item) continue;
      const pKey = item.kind === 'photo' ? photoKeyOf(item.url) : null;
      const key =
        item.kind === 'photo'
          ? `${item.tweetId}:${pKey || item.url}`
          : `${item.tweetId}:${item.mediaId || item.url}`;
      const existing = items.get(key);
      if (existing) {
        if (existing.mediaId === null && item.mediaId) {
          existing.mediaId = item.mediaId;
          byMedia.set(item.mediaId, existing);
        }
        if (existing.allowDownload === null) existing.allowDownload = item.allowDownload;
        continue;
      }
      items.set(key, item);
      if (item.mediaId) byMedia.set(item.mediaId, item);
      if (pKey) byPhoto.set(pKey, item);
      const forTweet = byTweet.get(item.tweetId);
      if (forTweet) forTweet.push(item);
      else byTweet.set(item.tweetId, [item]);
      added++;
    }
    evictOldest();
    return added;
  }

  function onMessage(event) {
    if (event.source !== window || event.origin !== location.origin) return;
    const data = event.data;
    if (!data || data.source !== 'xtend' || data.type !== 'media') return;
    const added = add(data.items);
    if (added && Xtend.debug) Xtend.debug.log(`+${added} media item(s), ${items.size} stored`);
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
    /** @returns {object|null} */
    byPhotoKey(photoKey) {
      return byPhoto.get(photoKey) || null;
    },
    /** @returns {object[]} media items of a post, in the order X listed them */
    byTweetId(tweetId) {
      return (byTweet.get(tweetId) || []).slice();
    },
    get size() {
      return items.size;
    },
    /** Forget everything (used by tests). */
    clear() {
      items.clear();
      byMedia.clear();
      byPhoto.clear();
      byTweet.clear();
    },
    MAX_ITEMS,
  };
})();
