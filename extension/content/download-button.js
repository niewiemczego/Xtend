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

  /** chrome.runtime.sendMessage with a callback (Chrome + WebKit), resolving to the reply. */
  function sendToWorker(message) {
    return new Promise((resolve, reject) => {
      try {
        const result = chrome.runtime.sendMessage(message, (reply) => {
          const error = chrome.runtime.lastError;
          if (error) reject(new Error(error.message || String(error)));
          else resolve(reply);
        });
        if (result && typeof result.then === 'function') result.then(resolve, reject);
      } catch (error) {
        reject(error);
      }
    });
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
    let saved = 0;
    let lastError = null;
    for (const video of items) {
      try {
        const reply = await Xtend.downloadButton.send({ type: 'xtend:download', video });
        if (reply && reply.ok) saved++;
        else lastError = new Error((reply && reply.error) || 'Download failed');
      } catch (error) {
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

  Xtend.downloadButton = {
    ensure,
    scan,
    downloadPost,
    /** Sends a message to the service worker; replaceable in tests. */
    send: sendToWorker,
    CLASS,
  };
})();
