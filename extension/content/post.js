// Working with a single post in the DOM: find the post for an action bar or Share menu,
// list its videos, and read the IDs needed to look a video up in the video store.
//
// Structure (tests/fixtures/html, 2026-11-26):
//   timeline     div[role=link][data-href=/<user>/status/<id>] > article > … video, action bar
//   status page  article > … video, action bar                     (ID only in the page URL)
//   quote        outer article > div[role=link][data-href=<quoted>] > article > … video

(function () {
  'use strict';

  const Xtend = (self.Xtend = self.Xtend || {});
  const S = Xtend.selectors;
  const STATUS_ID = /\/status\/(\d+)/;
  const DIRECT_MP4 = /^https:\/\/video\.twimg\.com\/[^?#]+\.mp4(?:[?#]|$)/;

  function statusIdFrom(path) {
    const m = typeof path === 'string' ? STATUS_ID.exec(path) : null;
    return m ? m[1] : null;
  }

  /** Action bars (role="group" with a reply button) inside `root`. */
  function findActionBars(root) {
    return Array.from(root.querySelectorAll(S.group)).filter((g) => g.querySelector(S.replyButton));
  }

  /** The post (<article>) an action bar belongs to. For a quote it is the outer post. */
  function findPost(actionBar) {
    return (actionBar && actionBar.closest(S.article)) || null;
  }

  /**
   * ID of the post `el` sits in: the nearest data-href above it, otherwise the status page URL.
   * For a <video> inside a quoted post this is the quoted post's ID.
   * @param {Element} el
   * @param {{pathname?: string}} [opts]  page path (defaults to location.pathname)
   */
  function tweetIdOf(el, opts) {
    const link = el && el.closest(S.postLink);
    if (link) return statusIdFrom(link.getAttribute('data-href'));
    const pathname = opts && opts.pathname !== undefined ? opts.pathname : location.pathname;
    return statusIdFrom(pathname);
  }

  /** Videos (and GIFs) in a post, in page order – including the quoted post's. */
  function videosOf(post) {
    return post ? Array.from(post.querySelectorAll(S.video)) : [];
  }

  function hasVideo(post) {
    return videosOf(post).length > 0;
  }

  /** Media ID from the poster (amplify_video_thumb / ext_tw_video_thumb); null for GIFs. */
  function mediaIdOf(video) {
    return self.XtendVideoMedia.mediaIdFromUrl(video && video.getAttribute('poster'));
  }

  /** GIFs play a real MP4 (video.twimg.com/tweet_video/….mp4); videos play a blob: URL. */
  function directMp4Of(video) {
    const src = video && video.getAttribute('src');
    return src && DIRECT_MP4.test(src) ? src : null;
  }

  /** The Share button of an action bar. */
  function shareButtonOf(actionBar) {
    return (actionBar && actionBar.querySelector(S.shareButton)) || null;
  }

  /** The post whose Share button opened `menu` (menu[aria-labelledby] → Share button id). */
  function postForMenu(menu) {
    const id = menu && menu.getAttribute('aria-labelledby');
    const trigger = id ? menu.ownerDocument.getElementById(id) : null;
    if (!trigger || !trigger.matches(S.shareButton)) return null;
    return findPost(trigger.closest(S.group));
  }

  Xtend.post = {
    findActionBars,
    findPost,
    tweetIdOf,
    videosOf,
    hasVideo,
    mediaIdOf,
    directMp4Of,
    shareButtonOf,
    postForMenu,
    statusIdFrom,
  };
})();
