// Maps a video or photo on screen to a downloadable link from the store.
//
// Videos (cheapest and most exact first):
//   1. GIF: the <video> already plays a direct video.twimg.com MP4 (prefer store copy if present)
//   2. media ID from the poster URL → store
//   3. post ID (nearest data-href, or the status page URL) → store, by position in the post
//   Nothing found → null: X hasn't sent this post's data (yet). No network fallback.
//
// Photos:
//   1. post ID + photo key (e.g. HX9WU9tWoAAIVEL) → store (keeps mediaId & GraphQL original format)
//   2. photo key → store (e.g. photo from another post, or status page without URL ID)
//   3. post ID + position in the post → store
//   4. direct name=orig URL from the <img> src (when the post ID is known, like GIFs)
//   Then every other photo the store has for those posts is added: a quoted post with several
//   photos shows only some of them on the home timeline, but X's data has them all.

(function () {
  'use strict';

  const Xtend = (self.Xtend = self.Xtend || {});
  const P = Xtend.post;

  function store() {
    return Xtend.videoStore;
  }

  /** Videos in `post` that belong to `tweetId`, in page order. */
  function videosOfTweet(post, tweetId, opts) {
    return P.videosOf(post).filter((v) => P.tweetIdOf(v, opts) === tweetId);
  }

  /** Photos in `post` that belong to `tweetId`, in page order. */
  function photosOfTweet(post, tweetId, opts) {
    return P.photosOf(post).filter((img) => P.tweetIdOf(img, opts) === tweetId);
  }

  /**
   * @param {HTMLVideoElement} video
   * @param {{pathname?: string}} [opts]  page path (defaults to location.pathname)
   * @returns {object|null} MediaItem
   */
  function resolveVideo(video, opts) {
    if (!video) return null;
    const tweetId = P.tweetIdOf(video, opts);

    // 1. GIF with a direct MP4 – prefer the store's copy (media ID, allowDownload)
    const direct = P.directMp4Of(video);
    if (direct) {
      const known = tweetId ? store().byTweetId(tweetId).find((i) => i.url === direct) : null;
      if (known) return known;
      if (!tweetId) return null;
      return { tweetId, mediaId: null, url: direct, bitrate: 0, kind: 'gif', allowDownload: null };
    }

    // 2. media ID from the poster
    const mediaId = P.mediaIdOf(video);
    if (mediaId) {
      const item = store().byMediaId(mediaId);
      if (item && item.kind !== 'photo') return item;
    }

    // 3. post ID + position of the video within that post
    if (!tweetId) return null;
    const list = store()
      .byTweetId(tweetId)
      .filter((i) => i.kind !== 'photo');
    if (!list.length) return null;
    const post = video.closest(Xtend.selectors.article);
    const siblings = post ? videosOfTweet(post, tweetId, opts) : [video];
    if (siblings.length !== list.length) return null; // can't tell which one is which
    return list[siblings.indexOf(video)] || null;
  }

  /**
   * @param {HTMLImageElement} img
   * @param {{pathname?: string}} [opts]  page path (defaults to location.pathname)
   * @returns {object|null} MediaItem
   */
  function resolvePhoto(img, opts) {
    if (!img) return null;
    const origUrl = P.photoOrigUrlOf(img);
    if (!origUrl) return null;
    const key = P.photoKeyOf(img);
    const tweetId = P.tweetIdOf(img, opts);

    // 1. exact tweet + photo key in store (preserves mediaId & original format even if DOM uses webp)
    if (tweetId && key) {
      const known = store()
        .byTweetId(tweetId)
        .find((i) => i.kind === 'photo' && self.XtendVideoMedia.photoKeyFromUrl(i.url) === key);
      if (known) return known;
    }

    // 2. photo key alone in store
    if (key) {
      const known = store().byPhotoKey(key);
      if (known) return known;
    }

    // 3. post ID + position of the photo within that post
    if (tweetId) {
      const list = store()
        .byTweetId(tweetId)
        .filter((i) => i.kind === 'photo');
      if (list.length) {
        const post = img.closest(Xtend.selectors.article);
        const siblings = post ? photosOfTweet(post, tweetId, opts) : [img];
        if (siblings.length === list.length) {
          const byPos = list[siblings.indexOf(img)];
          if (byPos) return byPos;
        }
      }
    }

    // 4. direct name=orig from the <img> src (like GIFs, works even if the store doesn't have it)
    if (!tweetId) return null;
    return { tweetId, mediaId: null, url: origUrl, bitrate: 0, kind: 'photo', allowDownload: null };
  }

  /** Dedupe key: photos by their key (the same photo can come as jpg / webp / name=…), the rest by URL. */
  function keyOf(item) {
    const photoKey = item.kind === 'photo' ? self.XtendVideoMedia.photoKeyFromUrl(item.url) : null;
    return photoKey ? `photo:${photoKey}` : item.url;
  }

  /**
   * Media of a post (incl. a quoted post's), without duplicates.
   * `opts.kind` filters to `'video'` (videos + GIFs) or `'photo'`; omit for both.
   * @returns {{items: object[], missing: number}} `missing` = elements without a known URL
   */
  function resolvePost(post, opts) {
    const filter = opts && opts.kind;
    const items = [];
    const seen = new Set();
    let missing = 0;

    const collect = (elements, resolve) => {
      for (const el of elements) {
        const item = resolve(el, opts);
        if (!item) {
          missing++;
        } else if (!seen.has(keyOf(item))) {
          seen.add(keyOf(item));
          items.push(item);
        }
      }
    };

    if (!filter || filter === 'video') collect(P.videosOf(post), resolveVideo);
    if (!filter || filter === 'photo') {
      const photos = P.photosOf(post);
      collect(photos, resolvePhoto);
      // the post's other photos X sent but doesn't show here (e.g. a quote card on the home timeline)
      const tweetIds = new Set(photos.map((img) => P.tweetIdOf(img, opts)).filter(Boolean));
      for (const tweetId of tweetIds) {
        for (const item of store().byTweetId(tweetId)) {
          if (item.kind !== 'photo' || seen.has(keyOf(item))) continue;
          seen.add(keyOf(item));
          items.push(item);
        }
      }
    }
    return { items, missing };
  }

  /** How many photos a download of `post` would save: shown ones, plus the rest X sent. */
  function photoCount(post, opts) {
    const resolved = resolvePost(post, Object.assign({}, opts, { kind: 'photo' })).items.length;
    return Math.max(P.photosOf(post).length, resolved);
  }

  Xtend.videoResolver = { resolveVideo, resolvePhoto, resolvePost, photoCount };
})();
