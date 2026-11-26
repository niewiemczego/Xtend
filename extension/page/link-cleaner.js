// Runs in the page's MAIN world at document_start, after shared/post-link.js.
// Removes tracking parameters from the post links X hands out:
//
//   Share menu → Copy link          navigator.clipboard.writeText(link)
//   Share menu → Share post via …   navigator.share({ url: link })
//
//   https://x.com/<user>/status/<id>?a=…&s=20  →  https://x.com/<user>/status/<id>
//
// Rules: X's call always goes through – only a post link is replaced, everything else is
// passed on untouched, with the same `this`, the same arguments and the same promise.
// Nothing is added that the browser doesn't have, every hook is wrapped in try/catch, and
// the script installs itself only once.

(function () {
  'use strict';

  const INSTALLED = Symbol.for('xtend.link-cleaner');
  if (window[INSTALLED]) return;
  Object.defineProperty(window, INSTALLED, { value: true });

  const postLink = self.XtendPostLink;
  if (!postLink) return;

  function debugEnabled() {
    try {
      return window.localStorage.getItem('xtendDebug') === '1';
    } catch (_) {
      return false;
    }
  }

  /** Clean link for `value`, or `value` itself; logs the change in debug mode. */
  function clean(value) {
    try {
      const cleaned = postLink.cleanPostUrl(value);
      if (cleaned !== value && debugEnabled()) {
        console.log('[xtend]', `cleaned link: ${value} → ${cleaned}`);
      }
      return cleaned;
    } catch (_) {
      return value;
    }
  }

  /** Replaces `proto[name]` with `wrap(original)`, keeping the property's attributes. */
  function hook(proto, name, wrap) {
    try {
      const descriptor = proto && Object.getOwnPropertyDescriptor(proto, name);
      if (!descriptor || typeof descriptor.value !== 'function') return;
      descriptor.value = wrap(descriptor.value);
      Object.defineProperty(proto, name, descriptor);
    } catch (_) {
      // leave the browser's method as it is
    }
  }

  const nav = window.navigator;
  if (!nav) return;

  // --- Copy link -------------------------------------------------------------
  let clipboard = null;
  try {
    clipboard = nav.clipboard; // only in secure contexts
  } catch (_) {
    // ignore
  }
  hook(clipboard && Object.getPrototypeOf(clipboard), 'writeText', (original) =>
    function writeText(data) {
      const args = Array.prototype.slice.call(arguments);
      if (args.length) args[0] = clean(data);
      return original.apply(this, args);
    },
  );

  // --- Share post via … ------------------------------------------------------
  hook(Object.getPrototypeOf(nav), 'share', (original) =>
    function share(data) {
      const args = Array.prototype.slice.call(arguments);
      try {
        if (data && typeof data === 'object') {
          const url = clean(data.url);
          const text = clean(data.text);
          if (url !== data.url || text !== data.text) {
            const copy = Object.assign({}, data);
            if (url !== data.url) copy.url = url;
            if (text !== data.text) copy.text = text;
            args[0] = copy;
          }
        }
      } catch (_) {
        // pass X's data on as it is
      }
      return original.apply(this, args);
    },
  );
})();
