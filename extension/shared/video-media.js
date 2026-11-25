// Finding MP4 links in X's JSON. Pure functions, no DOM.
//
// Loaded in three places:
//   - page world (manifest, before page/interceptor.js)  → self.XtendVideoMedia
//   - service worker (importScripts)                      → self.XtendVideoMedia
//   - Node tests (require)                                → module.exports
//
// To be implemented in #4: bestMp4(), extractFromGraphQL(), extractFromSyndication().

/**
 * @typedef {Object} VideoItem
 * @property {string} tweetId   ID of the post the video belongs to
 * @property {string|null} mediaId  media ID (matches the number in the poster URL)
 * @property {string} url       direct MP4 URL on video.twimg.com
 * @property {'video'|'gif'} kind
 */

(function (root) {
  'use strict';

  const XtendVideoMedia = {};

  root.XtendVideoMedia = XtendVideoMedia;
  if (typeof module === 'object' && module.exports) module.exports = XtendVideoMedia;
})(typeof self !== 'undefined' ? self : globalThis);
