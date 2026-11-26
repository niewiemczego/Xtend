// Downloading a post's videos: resolve the MP4 links, hand them to the service worker,
// and report progress and the result in a toast. Started from the Share menu.

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

  function debug(...args) {
    try {
      if (localStorage.getItem('xtendDebug') === '1') console.debug('[xtend]', ...args);
    } catch (_) {
      // no localStorage – no debug output
    }
  }

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
      { type: 'xtend:ping' },
      {
        timeoutMs: PING_TIMEOUT_MS,
        timeoutMessage: "Xtend's background script isn't answering (no reply to ping).",
      },
    );
    if (!reply || !reply.ok) throw new Error("Xtend's background script isn't answering (empty reply to ping).");
  }

  // --- downloading ---------------------------------------------------------------------

  /**
   * Downloads every video of a post (incl. a quoted post's).
   * @returns {Promise<{saved: number, authorDisabled: boolean}>}
   * @throws when nothing could be saved
   */
  async function downloadPost(post) {
    const { items, missing } = Xtend.videoResolver.resolvePost(post);
    if (!items.length) {
      throw new Error(
        missing ? "X hasn't sent this video yet – open the post or scroll it into view, then try again." : 'No video in this post.',
      );
    }
    debug('downloading', items);
    await pingWorker();
    debug('background script answered the ping');

    let saved = 0;
    let lastError = null;
    for (const video of items) {
      try {
        const reply = await Xtend.download.send(
          { type: 'xtend:download', video },
          {
            timeoutMs: DOWNLOAD_TIMEOUT_MS,
            timeoutMessage: "Xtend's background script didn't report back on the download (timed out).",
          },
        );
        debug('download reply', reply);
        if (reply && reply.ok) saved++;
        else lastError = new Error((reply && reply.error) || 'Download failed (empty reply).');
      } catch (error) {
        debug('download error', error);
        lastError = error;
      }
    }
    if (!saved) throw lastError || new Error('Download failed');
    return { saved, authorDisabled: items.some((i) => i.allowDownload === false) };
  }

  const busy = new WeakSet();

  /**
   * Downloads a post's videos and reports in a toast. A second call for the same post while
   * it is still downloading is ignored. Resolves when done (never rejects).
   */
  async function start(post) {
    if (!post || busy.has(post)) return;
    busy.add(post);
    const doc = post.ownerDocument;
    Xtend.toast.show('Downloading…', 'busy', doc);
    try {
      const { saved, authorDisabled } = await downloadPost(post);
      let text = saved > 1 ? `Saved ${saved} videos` : 'Saved';
      if (authorDisabled) text += ' – note: the author turned off downloads for this video';
      Xtend.toast.show(text, 'ok', doc);
    } catch (error) {
      Xtend.toast.show(errorMessage(error), 'error', doc);
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
