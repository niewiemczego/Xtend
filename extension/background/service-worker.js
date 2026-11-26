// Service worker: saves videos with chrome.downloads.
//
// Messages from the content script:
//   { type: 'xtend:ping' }                                            → { ok: true }
//   { type: 'xtend:download', video: { tweetId, mediaId, url, kind } } → { ok: true, downloadId, filename }
// Any failure → { ok: false, error }. Every step has a time limit, so the page never waits forever.
//
// The worker builds the file name itself and only accepts https://video.twimg.com/ URLs
// from Xtend's own content scripts on x.com, so nothing else can use it to download files.

(function () {
  'use strict';

  const VIDEO_URL = /^https:\/\/video\.twimg\.com\//;
  const DIGITS = /^\d+$/;
  const PAGE_ORIGINS = ['https://x.com', 'https://twitter.com', 'https://mobile.x.com'];
  const DOWNLOAD_TIMEOUT_MS = 15000;

  // Logs only for messages sent with { debug: true } (the page's debug mode, see README).
  let debugMessage = false;
  function log(...args) {
    if (debugMessage) console.log('[xtend]', ...args);
  }

  /** e.g. xtend_2125387364696756699_2125387308996468736.mp4 – no folders (not every browser allows them). */
  function buildFilename(video) {
    const parts = ['xtend', video.tweetId];
    if (video.mediaId) parts.push(video.mediaId);
    if (video.kind === 'gif') parts.push('gif');
    return `${parts.join('_')}.mp4`;
  }

  /** @returns {string|null} why the request is refused, or null when it's fine */
  function validate(message, sender) {
    if (!sender || sender.id !== chrome.runtime.id) return 'not from Xtend';
    let origin = sender.origin || '';
    if (!origin && sender.url) {
      try {
        origin = new URL(sender.url).origin;
      } catch (_) {
        origin = '';
      }
    }
    if (!PAGE_ORIGINS.includes(origin)) return 'not from x.com';
    const video = message.video;
    if (!video || typeof video !== 'object') return 'no video';
    if (typeof video.url !== 'string' || !VIDEO_URL.test(video.url)) return 'not a video.twimg.com URL';
    if (typeof video.tweetId !== 'string' || !DIGITS.test(video.tweetId)) return 'bad post ID';
    if (video.mediaId !== null && video.mediaId !== undefined && !DIGITS.test(String(video.mediaId))) {
      return 'bad media ID';
    }
    return null;
  }

  /**
   * chrome.downloads.download with a callback – works in Chrome and in WebKit-based browsers.
   * Gives up after DOWNLOAD_TIMEOUT_MS if the browser never answers.
   */
  function download(options) {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(
        () => reject(new Error('The browser did not start the download (chrome.downloads gave no answer).')),
        DOWNLOAD_TIMEOUT_MS,
      );
      const done = (fn) => (value) => {
        clearTimeout(timer);
        fn(value);
      };
      resolve = done(resolve);
      reject = done(reject);
      try {
        if (!chrome.downloads || typeof chrome.downloads.download !== 'function') {
          throw new Error('This browser has no chrome.downloads API.');
        }
        const result = chrome.downloads.download(options, (downloadId) => {
          const error = chrome.runtime.lastError;
          if (error) reject(new Error(error.message || String(error)));
          else resolve(downloadId);
        });
        // Some implementations return a promise instead of calling the callback.
        if (result && typeof result.then === 'function') result.then(resolve, reject);
      } catch (error) {
        reject(error);
      }
    });
  }

  async function handleDownload(message, sender) {
    const refused = validate(message, sender);
    if (refused) return { ok: false, error: refused };
    const video = message.video;
    const filename = buildFilename(video);
    log('download', filename, video.url);
    try {
      const downloadId = await download({ url: video.url, filename, conflictAction: 'uniquify' });
      log('download started', downloadId);
      return { ok: true, downloadId, filename };
    } catch (error) {
      log('download failed', error);
      return { ok: false, error: String((error && error.message) || error) };
    }
  }

  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (!message) return false;
    debugMessage = message.debug === true;
    if (message.type === 'xtend:ping') {
      sendResponse({ ok: true });
      return false;
    }
    if (message.type !== 'xtend:download') return false;
    handleDownload(message, sender).then(sendResponse);
    return true; // reply asynchronously
  });


  // For tests
  self.XtendBackground = { buildFilename, validate, handleDownload, DOWNLOAD_TIMEOUT_MS };
})();
