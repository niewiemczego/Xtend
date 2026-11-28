// Cleaning the post links X hands out. Pure functions, no DOM.
//
// Loaded in two places:
//   - page world (manifest, before page/link-cleaner.js)  → self.XtendPostLink
//   - Node tests (require)                                → module.exports
//
// Format (see tests/fixtures/README.md): Copy link and Share post via … give
// `https://x.com/<user>/status/<id>?s=20`, signed in also `?a=<sharer>&s=20`.
//
// Also loaded in the isolated world (manifest, before content/embed-link.js) for the
// Share menu's "Copy embed link": the same post on fixupx.com (FxEmbed), whose link
// previews play videos inline in Discord, Telegram and other chat apps.

(function (root) {
  'use strict';

  const HOSTS = new Set([
    'x.com',
    'www.x.com',
    'mobile.x.com',
    'twitter.com',
    'www.twitter.com',
    'mobile.twitter.com',
  ]);

  // /<user>/status/<id>, optionally /photo/<n> or /video/<n>, optionally a trailing slash
  const POST_PATH = /^\/[A-Za-z0-9_]{1,15}\/status\/\d+(?:\/(?:photo|video)\/\d+)?\/?$/;

  /**
   * A post link without its query string and hash; anything else is returned as it
   * came in. Only a string that is nothing but a post link counts – text around the
   * link, other hosts, ports or credentials leave it untouched. Never throws.
   * @param {*} value
   * @returns {*} the clean link, or `value` unchanged
   */
  function cleanPostUrl(value) {
    if (typeof value !== 'string' || !/^https:\/\/\S+$/.test(value)) return value;
    let url;
    try {
      url = new URL(value);
    } catch (_) {
      return value;
    }
    if (url.username || url.password || url.port) return value;
    if (!HOSTS.has(url.hostname) || !POST_PATH.test(url.pathname)) return value;
    return `${url.origin}${url.pathname}`;
  }

  const EMBED_ORIGIN = 'https://fixupx.com';

  // the /<user>/status/<id> part at the start of a path – what follows (/photo/1, /analytics …) is dropped
  const POST_PREFIX = /^\/([A-Za-z0-9_]{1,15})\/status\/(\d+)(?:[/?#]|$)/;

  /**
   * The embed link for a post path, e.g. `/user/status/123` (an X `data-href` or the
   * status page's `location.pathname`) → `https://fixupx.com/user/status/123`.
   * Anything that doesn't start with a post path gives null. Never throws.
   * @param {*} path
   * @returns {string|null}
   */
  function embedPostUrl(path) {
    if (typeof path !== 'string') return null;
    const m = POST_PREFIX.exec(path);
    return m ? `${EMBED_ORIGIN}/${m[1]}/status/${m[2]}` : null;
  }

  const XtendPostLink = { cleanPostUrl, embedPostUrl, EMBED_ORIGIN };

  root.XtendPostLink = XtendPostLink;
  if (typeof module === 'object' && module.exports) module.exports = XtendPostLink;
})(typeof self !== 'undefined' ? self : globalThis);
