// Downloading a post's videos, GIFs or photos: resolve their links and hand them to the service worker.
// Started from the Share menu. Nothing is shown on the page – progress and errors go to the
// console in debug mode (content/debug.js).

(function () {
  'use strict';

  const Xtend = (self.Xtend = self.Xtend || {});

  // 20×20 box, drawing spans 16×17 (x 2–18, y 1.5–18.5 incl. the 1.5 stroke).
  const ICON =
    '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" ' +
    'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M10 2.25V12.25"/><path d="M5.75 8L10 12.25L14.25 8"/>' +
    '<path d="M2.75 12.5V17.75H17.25V12.5"/></svg>';

  // The worker answers a ping at once; a download can take a moment to start
  // (its own limit is 15 s), so the page waits a bit longer than that.
  const PING_TIMEOUT_MS = 5000;
  const DOWNLOAD_TIMEOUT_MS = 20000;

  const log = (...args) => Xtend.debug.log(...args);

  function errorMessage(error) {
    const text = String((error && error.message) || error || 'Unknown error');
    return /context invalidated/i.test(text) ? 'Xtend was updated – refresh the page.' : text;
  }

  // --- talking to the service worker ---------------------------------------------------

  /**
   * chrome.runtime.sendMessage with a callback (Chrome + WebKit), resolving to the reply.
   * Rejects with `timeoutMessage` when no reply arrives within `timeoutMs`.
   */
  function sendToWorker(message, { timeoutMs = DOWNLOAD_TIMEOUT_MS, timeoutMessage, runtime } = {}) {
    const rt = runtime || chrome.runtime;
    return new Promise((resolve, reject) => {
      let settled = false;
      const finish = (fn, value) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        fn(value);
      };
      const timer = setTimeout(
        () => finish(reject, new Error(timeoutMessage || 'No answer from Xtend (timed out).')),
        timeoutMs,
      );
      try {
        const result = rt.sendMessage(message, (reply) => {
          const error = rt.lastError;
          if (error) finish(reject, new Error(error.message || String(error)));
          else finish(resolve, reply);
        });
        if (result && typeof result.then === 'function') {
          result.then((reply) => finish(resolve, reply), (error) => finish(reject, error));
        }
      } catch (error) {
        finish(reject, error);
      }
    });
  }

  /** Is the service worker running and answering? */
  async function pingWorker() {
    const reply = await Xtend.download.send(
      { type: 'xtend:ping', debug: Xtend.debug.enabled() },
      {
        timeoutMs: PING_TIMEOUT_MS,
        timeoutMessage: "Xtend's background script isn't answering (no reply to ping).",
      },
    );
    if (!reply || !reply.ok) throw new Error("Xtend's background script isn't answering (empty reply to ping).");
  }

  // --- downloading ---------------------------------------------------------------------

  function nounFor(post, opts) {
    const kind = opts && opts.kind;
    if (kind === 'photo') return 'photo';
    if (kind === 'video') return 'video';
    if (Xtend.post.hasVideo(post) && !Xtend.post.hasPhoto(post)) return 'video';
    if (Xtend.post.hasPhoto(post) && !Xtend.post.hasVideo(post)) return 'photo';
    return 'media';
  }

  /**
   * Downloads a post's media (incl. a quoted post's). `opts.kind` filters to `'video'` or `'photo'`.
   * @returns {Promise<{saved: number, authorDisabled: boolean}>}
   * @throws when nothing could be saved
   */
  async function downloadPost(post, opts) {
    const { items, missing } = Xtend.videoResolver.resolvePost(post, opts);
    if (!items.length) {
      const noun = nounFor(post, opts);
      throw new Error(
        missing
          ? `X hasn't sent this ${noun} yet – open the post or scroll it into view, then try again.`
          : `No ${noun} in this post.`,
      );
    }
    log('downloading', items);
    await pingWorker();
    log('background script answered the ping');

    let saved = 0;
    let lastError = null;
    for (const media of items) {
      try {
        const reply = await Xtend.download.send(
          { type: 'xtend:download', media, debug: Xtend.debug.enabled() },
          {
            timeoutMs: DOWNLOAD_TIMEOUT_MS,
            timeoutMessage: "Xtend's background script didn't report back on the download (timed out).",
          },
        );
        log('download reply', reply);
        if (reply && reply.ok) saved++;
        else lastError = new Error((reply && reply.error) || 'Download failed (empty reply).');
      } catch (error) {
        log('download error', error);
        lastError = error;
      }
    }
    if (!saved) throw lastError || new Error('Download failed');
    return { saved, authorDisabled: items.some((i) => i.allowDownload === false) };
  }

  const busy = new WeakSet();

  /**
   * Downloads a post's media. A second call for the same post while it is still downloading
   * is ignored. Never rejects; the outcome is logged in debug mode and returned:
   * { ok: true, saved, authorDisabled } | { ok: false, error } | { ok: false, skipped: true }
   */
  async function start(post, opts) {
    if (!post || busy.has(post)) return { ok: false, skipped: true };
    busy.add(post);
    try {
      const { saved, authorDisabled } = await downloadPost(post, opts);
      const noun = nounFor(post, opts);
      log(
        `saved ${saved} ${noun === 'media' ? 'item(s)' : `${noun}(s)`}` +
          (authorDisabled ? ' – the author turned off downloads for this media' : ''),
      );
      return { ok: true, saved, authorDisabled };
    } catch (error) {
      const message = errorMessage(error);
      Xtend.debug.warn('download failed:', message);
      return { ok: false, error: message };
    } finally {
      busy.delete(post);
    }
  }

  Xtend.download = {
    start,
    downloadPost,
    /** Sends a message to the service worker: (message, {timeoutMs, timeoutMessage}) → reply. Replaceable in tests. */
    send: sendToWorker,
    sendToWorker,
    ICON,
  };
})();
