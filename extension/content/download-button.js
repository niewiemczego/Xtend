// Download icon in the post's action bar.
//
// The button is a clone of X's own Share button, so it gets X's look (x-engagement-button /
// x-engagement-pill, sizes, hover) and follows X when they restyle it. Only the icon, the
// label and the behaviour are ours. It sits first in the container that holds Bookmark and
// Share (div.flex.shrink-0.items-center), i.e. right before Bookmark.

(function () {
  'use strict';

  const Xtend = (self.Xtend = self.Xtend || {});
  const P = Xtend.post;

  const CLASS = 'xtend-download';
  const LABEL = 'Download video';
  const STATE_MS = 2500;

  // 20×20 box, drawing spans 16×17 (x 2–18, y 1.5–18.5 incl. the 1.5 stroke). X scales the
  // pill's first child (18.75 px on the timeline, 20 px on the status page) – same as its icons.
  const ICON =
    '<svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" ' +
    'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M10 2.25V12.25"/><path d="M5.75 8L10 12.25L14.25 8"/>' +
    '<path d="M2.75 12.5V17.75H17.25V12.5"/></svg>';

  // Clicks on the button must not reach the post (which opens on click).
  const STOPPED_EVENTS = ['pointerdown', 'pointerup', 'mousedown', 'mouseup', 'touchstart', 'touchend', 'keydown', 'keyup'];

  // --- talking to the service worker -----------------------------------------------

  function errorMessage(error) {
    const text = String((error && error.message) || error || 'Unknown error');
    return /context invalidated/i.test(text) ? 'Xtend was updated – refresh the page.' : text;
  }

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
    const reply = await Xtend.downloadButton.send(
      { type: 'xtend:ping' },
      {
        timeoutMs: PING_TIMEOUT_MS,
        timeoutMessage: "Xtend's background script isn't answering (no reply to ping).",
      },
    );
    if (!reply || !reply.ok) throw new Error("Xtend's background script isn't answering (empty reply to ping).");
  }

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
        const reply = await Xtend.downloadButton.send(
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

  // --- the button ----------------------------------------------------------------------

  function setState(button, state, title) {
    button.classList.remove('xtend-busy', 'xtend-ok', 'xtend-error');
    if (state) button.classList.add(`xtend-${state}`);
    button.title = title || LABEL;
    clearTimeout(button._xtendTimer);
    if (state === 'ok' || state === 'error') {
      button._xtendTimer = setTimeout(() => setState(button, null), STATE_MS);
    }
  }

  async function onClick(event, button, post) {
    event.preventDefault();
    event.stopPropagation();
    if (button.classList.contains('xtend-busy')) return;
    setState(button, 'busy', 'Downloading…');
    try {
      const { saved, authorDisabled } = await downloadPost(post);
      let title = saved > 1 ? `Saved ${saved} videos` : 'Saved';
      if (authorDisabled) title += ' – note: the author turned off downloads for this video';
      setState(button, 'ok', title);
    } catch (error) {
      setState(button, 'error', errorMessage(error));
    }
  }

  /** X's Share button, cleaned up: no id, data-* or aria-* (menu wiring), our icon and label. */
  function createButton(share, post) {
    const button = share.cloneNode(true);
    for (const attr of Array.from(button.attributes)) {
      if (attr.name === 'id' || attr.name.startsWith('data-') || attr.name.startsWith('aria-')) {
        button.removeAttribute(attr.name);
      }
    }
    button.type = 'button';
    button.classList.add(CLASS);
    button.setAttribute('aria-label', LABEL);
    button.title = LABEL;

    const icon = button.querySelector('svg');
    if (icon) icon.outerHTML = ICON;
    else button.insertAdjacentHTML('afterbegin', ICON);

    for (const type of STOPPED_EVENTS) button.addEventListener(type, (e) => e.stopPropagation());
    button.addEventListener('click', (e) => onClick(e, button, post));
    return button;
  }

  /** Adds the button to an action bar if it isn't there yet. Returns the button or null. */
  function ensure(actionBar, post) {
    const existing = actionBar.querySelector(`.${CLASS}`);
    if (existing) return existing;
    const share = P.shareButtonOf(actionBar);
    if (!share || !share.parentElement) return null;
    const button = createButton(share, post);
    const container = share.parentElement;
    container.insertBefore(button, container.firstElementChild);
    return button;
  }

  /** Adds buttons to every post with a video under `root`. */
  function scan(root) {
    for (const bar of P.findActionBars(root)) {
      const post = P.findPost(bar);
      if (post && P.hasVideo(post)) ensure(bar, post);
    }
  }

  /**
   * Starts a download for `post` as if its button was clicked (used by the Share menu), so the
   * button shows the progress and the result. Without a button, downloads directly.
   */
  function start(post) {
    const bar = P.findActionBars(post).find((b) => P.findPost(b) === post);
    const button = bar ? ensure(bar, post) : null;
    if (button) button.click();
    else downloadPost(post).catch(() => {});
  }

  Xtend.downloadButton = {
    ensure,
    scan,
    start,
    downloadPost,
    /** Sends a message to the service worker: (message, {timeoutMs, timeoutMessage}) → reply. Replaceable in tests. */
    send: sendToWorker,
    sendToWorker,
    CLASS,
    ICON,
  };
})();
