// Cleaning the post links X hands out. Pure functions, no DOM.
//
// Loaded in two places:
//   - page world (manifest, before page/link-cleaner.js)  → self.XtendPostLink
//   - Node tests (require)                                → module.exports
//
// Format (see tests/fixtures/README.md): Copy link and Share post via … give
// `https://x.com/<user>/status/<id>?s=20`, signed in also `?a=<sharer>&s=20`.

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

  const XtendPostLink = { cleanPostUrl };

  root.XtendPostLink = XtendPostLink;
  if (typeof module === 'object' && module.exports) module.exports = XtendPostLink;
})(typeof self !== 'undefined' ? self : globalThis);
