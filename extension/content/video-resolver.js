// Maps a video on screen to an MP4 link from the video store.
//
// Order, cheapest and most exact first:
//   1. GIF: the <video> already plays a direct video.twimg.com MP4
//   2. media ID from the poster URL → store
//   3. post ID (nearest data-href, or the status page URL) → store, by position in the post
// Nothing found → null: X hasn't sent this post's data (yet). No network fallback.

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

  /**
   * @param {HTMLVideoElement} video
   * @param {{pathname?: string}} [opts]  page path (defaults to location.pathname)
   * @returns {object|null} VideoItem
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
      if (item) return item;
    }

    // 3. post ID + position of the video within that post
    if (!tweetId) return null;
    const list = store().byTweetId(tweetId);
    if (!list.length) return null;
    const post = video.closest(Xtend.selectors.article);
    const siblings = post ? videosOfTweet(post, tweetId, opts) : [video];
    if (siblings.length !== list.length) return null; // can't tell which one is which
    return list[siblings.indexOf(video)] || null;
  }

  /**
   * All videos of a post (incl. a quoted post's), without duplicates.
   * @returns {{items: object[], missing: number}} `missing` = videos without a known MP4
   */
  function resolvePost(post, opts) {
    const items = [];
    const seen = new Set();
    let missing = 0;
    for (const video of P.videosOf(post)) {
      const item = resolveVideo(video, opts);
      if (!item) {
        missing++;
      } else if (!seen.has(item.url)) {
        seen.add(item.url);
        items.push(item);
      }
    }
    return { items, missing };
  }

  Xtend.videoResolver = { resolveVideo, resolvePost };
})();
