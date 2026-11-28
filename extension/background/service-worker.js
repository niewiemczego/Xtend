// Service worker: saves videos, GIFs and photos with chrome.downloads.
//
// Messages from the content script:
//   { type: 'xtend:ping' }                                            → { ok: true }
//   { type: 'xtend:download', media: { tweetId, mediaId, url, kind } } → { ok: true, downloadId, filename }
// Any failure → { ok: false, error }. Every step has a time limit, so the page never waits forever.
//
// The worker builds the file name itself and only accepts https://video.twimg.com/ (videos/GIFs)
// and https://pbs.twimg.com/media/ (photos) URLs from Xtend's own content scripts on x.com,
// so nothing else can use it to download files.

(function () {
  'use strict';

  const DIGITS = /^\d+$/;
  const KINDS = new Set(['video', 'gif', 'photo']);
  const IMAGE_EXTS = new Set(['jpg', 'jpeg', 'png', 'webp', 'avif']);
  const PHOTO_PATH = /^\/media\/[A-Za-z0-9_-]+(?:\.[a-zA-Z0-9]+)?$/;
  const PAGE_ORIGINS = ['https://x.com', 'https://twitter.com', 'https://mobile.x.com'];
  const DOWNLOAD_TIMEOUT_MS = 15000;

  // Logs only for messages sent with { debug: true } (the page's debug mode, see README).
  let debugMessage = false;
  function log(...args) {
    if (debugMessage) console.log('[xtend]', ...args);
  }

  function imageExtension(url) {
    try {
      const parsed = new URL(url);
      const format = (parsed.searchParams.get('format') || '').toLowerCase();
      if (IMAGE_EXTS.has(format)) return format;
      const m = /\.([a-zA-Z0-9]+)$/.exec(parsed.pathname);
      if (m && IMAGE_EXTS.has(m[1].toLowerCase())) return m[1].toLowerCase();
    } catch (_) {
      // fall through
    }
    return 'jpg';
  }

  /** e.g. xtend_2125387364696756699_2125387308996468736.mp4 or .jpg – no folders (not every browser allows them). */
  function buildFilename(media) {
    const parts = ['xtend', media.tweetId];
    if (media.mediaId) parts.push(media.mediaId);
    if (media.kind === 'gif') parts.push('gif');
    const ext = media.kind === 'photo' ? imageExtension(media.url) : 'mp4';
    return `${parts.join('_')}.${ext}`;
  }

  function isAllowedUrl(kind, url) {
    if (typeof url !== 'string') return false;
    try {
      const parsed = new URL(url);
      if (parsed.protocol !== 'https:') return false;
      if (kind === 'photo') return parsed.hostname === 'pbs.twimg.com' && PHOTO_PATH.test(parsed.pathname);
      return parsed.hostname === 'video.twimg.com';
    } catch (_) {
      return false;
    }
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
    const media = message.media || message.video;
    if (!media || typeof media !== 'object') return 'no media';
    if (!KINDS.has(media.kind)) return 'bad media kind';
    if (!isAllowedUrl(media.kind, media.url)) {
      return media.kind === 'photo' ? 'not a pbs.twimg.com URL' : 'not a video.twimg.com URL';
    }
    if (typeof media.tweetId !== 'string' || !DIGITS.test(media.tweetId)) return 'bad post ID';
    if (media.mediaId !== null && media.mediaId !== undefined && !DIGITS.test(String(media.mediaId))) {
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
    const media = message.media || message.video;
    const filename = buildFilename(media);
    log('download', filename, media.url);
    try {
      const downloadId = await download({ url: media.url, filename, conflictAction: 'uniquify' });
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
